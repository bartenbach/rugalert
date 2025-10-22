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
 * DAILY UPTIME TRACKING (Fixed Design):
 * - One record per validator per day
 * - UPSERT (update if exists, create if not) based on key = "votePubkey-date"
 * - Increment uptimeChecks and delinquentChecks for today's record
 * 
 * Result: 1,000 new records per day (not per minute!)
 */
export async function GET(req: NextRequest) {
  try {
    console.log(`\n🩺 === DELINQUENCY CHECK START ===`);
    const startTime = Date.now();

    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Get current delinquent validators from RPC
    const voteAccounts = await rpc("getVoteAccounts", []);
    const activeValidators = voteAccounts.current || [];
    const delinquentValidators = voteAccounts.delinquent || [];

    const allVotePubkeys = [
      ...activeValidators.map((v: any) => v.votePubkey),
      ...delinquentValidators.map((v: any) => v.votePubkey)
    ];

    const delinquentSet = new Set(
      delinquentValidators.map((v: any) => v.votePubkey)
    );

    console.log(`📊 Network: ${activeValidators.length} active, ${delinquentValidators.length} delinquent`);
    console.log(`📅 Processing date: ${today}`);

    // Fetch existing records for today - SIMPLE: key ends with today's date
    // Key format: "votePubkey-YYYY-MM-DD"
    const existingRecordsMap = new Map<string, { id: string; uptimeChecks: number; delinquentChecks: number }>();
    
    await tb.dailyUptime
      .select({
        filterByFormula: `FIND("-${today}", {key}) > 0`,
        fields: ['key', 'votePubkey', 'uptimeChecks', 'delinquentChecks'],
        pageSize: 100,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const votePubkey = record.get('votePubkey') as string;
          if (votePubkey) {
            existingRecordsMap.set(votePubkey, {
              id: record.id,
              uptimeChecks: Number(record.get('uptimeChecks') || 0),
              delinquentChecks: Number(record.get('delinquentChecks') || 0),
            });
          }
        });
        fetchNextPage();
      });

    console.log(`📦 Found ${existingRecordsMap.size}/${allVotePubkeys.length} existing records for ${today}`);

    // Prepare updates and creates
    const recordsToUpdate: any[] = [];
    const recordsToCreate: any[] = [];

    for (const votePubkey of allVotePubkeys) {
      const isDelinquent = delinquentSet.has(votePubkey);
      const existing = existingRecordsMap.get(votePubkey);

      if (existing) {
        // UPDATE existing record
        recordsToUpdate.push({
          id: existing.id,
          fields: {
            uptimeChecks: existing.uptimeChecks + 1,
            delinquentChecks: isDelinquent ? existing.delinquentChecks + 1 : existing.delinquentChecks,
            uptimePercent: ((existing.uptimeChecks + 1 - (isDelinquent ? existing.delinquentChecks + 1 : existing.delinquentChecks)) / (existing.uptimeChecks + 1)) * 100,
          }
        });
      } else {
        // CREATE new record for today
        recordsToCreate.push({
          fields: {
            key: `${votePubkey}-${today}`,
            votePubkey,
            date: today,
            uptimeChecks: 1,
            delinquentChecks: isDelinquent ? 1 : 0,
            uptimePercent: isDelinquent ? 0 : 100,
          }
        });
      }
    }

    console.log(`📝 Updating ${recordsToUpdate.length} records, creating ${recordsToCreate.length} records`);

    // Batch operations (10 at a time)
    let updated = 0;
    for (let i = 0; i < recordsToUpdate.length; i += 10) {
      const batch = recordsToUpdate.slice(i, i + 10);
      await tb.dailyUptime.update(batch);
      updated += batch.length;
    }

    let created = 0;
    for (let i = 0; i < recordsToCreate.length; i += 10) {
      const batch = recordsToCreate.slice(i, i + 10);
      await tb.dailyUptime.create(batch);
      created += batch.length;
    }

    // Also update validator's current delinquent status
    const validatorsToUpdate: any[] = [];
    await tb.validators
      .select({
        fields: ['votePubkey', 'delinquent'],
        pageSize: 100,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const votePubkey = record.get('votePubkey') as string;
          const currentDelinquent = Boolean(record.get('delinquent'));
          const shouldBeDelinquent = delinquentSet.has(votePubkey);
          
          // Only update if status changed
          if (currentDelinquent !== shouldBeDelinquent) {
            validatorsToUpdate.push({
              id: record.id,
              fields: { delinquent: shouldBeDelinquent }
            });
          }
        });
        fetchNextPage();
      });

    let validatorsUpdated = 0;
    if (validatorsToUpdate.length > 0) {
      for (let i = 0; i < validatorsToUpdate.length; i += 10) {
        const batch = validatorsToUpdate.slice(i, i + 10);
        await tb.validators.update(batch);
        validatorsUpdated += batch.length;
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Updated ${updated} records, created ${created} records, updated ${validatorsUpdated} validator statuses`);
    console.log(`🩺 === DELINQUENCY CHECK COMPLETE (${elapsed}ms) ===\n`);

    return NextResponse.json({
      success: true,
      date: today,
      activeValidators: activeValidators.length,
      delinquentValidators: delinquentValidators.length,
      recordsUpdated: updated,
      recordsCreated: created,
      validatorsUpdated,
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
