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

export async function GET(req: NextRequest) {
  try {
    console.log(`\n🩺 === DELINQUENCY CHECK START ===`);
    const startTime = Date.now();

    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current date in YYYY-MM-DD format
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // e.g., "2025-10-22"

    console.log(`📅 Date: ${dateStr}`);

    // Get all vote accounts (active and delinquent)
    console.log(`🔍 Fetching vote accounts...`);
    const votes = await rpc("getVoteAccounts");
    
    // Build set of delinquent validators
    const delinquentSet = new Set<string>();
    votes.delinquent.forEach((v: any) => {
      delinquentSet.add(v.votePubkey);
    });

    const allVotePubkeys = [
      ...votes.current.map((v: any) => v.votePubkey),
      ...votes.delinquent.map((v: any) => v.votePubkey),
    ];

    console.log(`📊 Total validators: ${allVotePubkeys.length}`);
    console.log(`❌ Delinquent: ${delinquentSet.size}`);
    console.log(`✅ Active: ${allVotePubkeys.length - delinquentSet.size}`);

    // Fetch existing daily uptime records for today
    const existingRecordsMap = new Map<string, any>();
    await tb.dailyUptime
      .select({
        filterByFormula: `{date} = "${dateStr}"`,
        pageSize: 100,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const votePubkey = record.get('votePubkey') as string;
          existingRecordsMap.set(votePubkey, record);
        });
        fetchNextPage();
      });

    console.log(`📦 Existing records for today: ${existingRecordsMap.size}`);

    // Update records in batches
    const recordsToCreate: any[] = [];
    const recordsToUpdate: any[] = [];

    for (const votePubkey of allVotePubkeys) {
      const isDelinquent = delinquentSet.has(votePubkey);
      const existing = existingRecordsMap.get(votePubkey);

      if (existing) {
        // Update existing record
        const currentDelinquentMinutes = Number(existing.get('delinquentMinutes') || 0);
        const currentTotalChecks = Number(existing.get('totalChecks') || 0);
        
        const newDelinquentMinutes = isDelinquent ? currentDelinquentMinutes + 1 : currentDelinquentMinutes;
        const newTotalChecks = currentTotalChecks + 1;
        const newUptimePercent = 100 - ((newDelinquentMinutes / newTotalChecks) * 100);

        recordsToUpdate.push({
          id: existing.id,
          fields: {
            delinquentMinutes: newDelinquentMinutes,
            totalChecks: newTotalChecks,
            uptimePercent: Math.round(newUptimePercent * 100) / 100, // 2 decimal places
          }
        });
      } else {
        // Create new record
        const key = `${votePubkey}-${dateStr}`;
        const delinquentMinutes = isDelinquent ? 1 : 0;
        const totalChecks = 1;
        const uptimePercent = 100 - ((delinquentMinutes / totalChecks) * 100);

        recordsToCreate.push({
          fields: {
            key,
            votePubkey,
            date: dateStr,
            delinquentMinutes,
            totalChecks,
            uptimePercent: Math.round(uptimePercent * 100) / 100,
          }
        });
      }
    }

    // Batch create (max 10 at a time for Airtable)
    let created = 0;
    for (let i = 0; i < recordsToCreate.length; i += 10) {
      const batch = recordsToCreate.slice(i, i + 10);
      await tb.dailyUptime.create(batch);
      created += batch.length;
    }

    // Batch update (max 10 at a time for Airtable)
    let updated = 0;
    for (let i = 0; i < recordsToUpdate.length; i += 10) {
      const batch = recordsToUpdate.slice(i, i + 10);
      await tb.dailyUptime.update(batch);
      updated += batch.length;
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Created ${created} records`);
    console.log(`✅ Updated ${updated} records`);
    console.log(`⏱️  Total time: ${elapsed}ms`);
    console.log(`🩺 === DELINQUENCY CHECK COMPLETE ===\n`);

    return NextResponse.json({
      success: true,
      date: dateStr,
      totalValidators: allVotePubkeys.length,
      delinquent: delinquentSet.size,
      active: allVotePubkeys.length - delinquentSet.size,
      created,
      updated,
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

