import { NextRequest, NextResponse } from "next/server";
import { tb } from "../../../lib/airtable";

// ---- JSON-RPC helper ----
async function rpc(method: string, params: any[] = []) {
  const res = await fetch(process.env.RPC_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(JSON.stringify(json.error || res.status));
  return json.result;
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds for Vercel Pro

/**
 * NEW EFFICIENT DESIGN:
 * Instead of storing 1000+ updates per minute, we:
 * 1. Only store EVENTS when delinquency status CHANGES
 * 2. Track current state in validators table
 * 3. Calculate uptime from event history
 * 
 * This reduces writes from ~1M/day to ~100-1000/day
 */
export async function GET(req: NextRequest) {
  try {
    console.log(`\n🩺 === DELINQUENCY CHECK START (Event-based) ===`);
    const startTime = Date.now();

    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date().toISOString();

    // Get current delinquent validators from RPC
    const voteAccounts = await rpc("getVoteAccounts", []);
    const activeValidators = voteAccounts.current || [];
    const delinquentValidators = voteAccounts.delinquent || [];

    const currentDelinquentSet = new Set(
      delinquentValidators.map((v: any) => v.votePubkey)
    );

    console.log(`📊 Network status: ${activeValidators.length} active, ${delinquentValidators.length} delinquent`);

    // Fetch current delinquency state from validators table
    const validatorsMap = new Map<string, { id: string; wasDelinquent: boolean }>();
    await tb.validators
      .select({
        fields: ['votePubkey', 'delinquent'],
        pageSize: 100,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const votePubkey = record.get('votePubkey') as string;
          const delinquent = Boolean(record.get('delinquent'));
          validatorsMap.set(votePubkey, {
            id: record.id,
            wasDelinquent: delinquent,
          });
        });
        fetchNextPage();
      });

    console.log(`📦 Loaded ${validatorsMap.size} validators from DB`);

    // Detect state changes and create events
    const eventsToCreate: any[] = [];
    const validatorsToUpdate: any[] = [];

    for (const [votePubkey, state] of validatorsMap.entries()) {
      const isNowDelinquent = currentDelinquentSet.has(votePubkey);
      
      // State changed - create event!
      if (isNowDelinquent !== state.wasDelinquent) {
        const eventType = isNowDelinquent ? 'WENT_DOWN' : 'CAME_UP';
        eventsToCreate.push({
          fields: {
            votePubkey,
            eventType,
            timestamp: now,
          }
        });
        
        // Update validator state
        validatorsToUpdate.push({
          id: state.id,
          fields: {
            delinquent: isNowDelinquent,
          }
        });
      }
    }

    console.log(`🔔 Detected ${eventsToCreate.length} state changes`);

    // Write events to delinquency_events table (batched)
    let eventsCreated = 0;
    if (eventsToCreate.length > 0) {
      for (let i = 0; i < eventsToCreate.length; i += 10) {
        const batch = eventsToCreate.slice(i, i + 10);
        await tb.delinquencyEvents.create(batch);
        eventsCreated += batch.length;
      }
      console.log(`✅ Created ${eventsCreated} delinquency events`);

      // Update validator states (batched)
      let validatorsUpdated = 0;
      for (let i = 0; i < validatorsToUpdate.length; i += 10) {
        const batch = validatorsToUpdate.slice(i, i + 10);
        await tb.validators.update(batch);
        validatorsUpdated += batch.length;
      }
      console.log(`✅ Updated ${validatorsUpdated} validator states`);
    } else {
      console.log(`✅ No state changes - no writes needed`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`🩺 === DELINQUENCY CHECK COMPLETE (${elapsed}ms) ===\n`);

    return NextResponse.json({
      success: true,
      activeValidators: activeValidators.length,
      delinquentValidators: delinquentValidators.length,
      stateChanges: eventsToCreate.length,
      eventsCreated,
      elapsed: `${elapsed}ms`,
    });

  } catch (error: any) {
    console.error("❌ Delinquency check error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check delinquency" },
      { status: 500 }
    );
  }
}
