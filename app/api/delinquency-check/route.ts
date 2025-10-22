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

    // Get current date in YYYY-MM-DD format (UTC)
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

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

    // Fetch ALL existing records for today using the key field
    const existingRecordsMap = new Map<string, any>();
    console.log(`🔍 Fetching existing records for ${dateStr}...`);
    
    await tb.dailyUptime
      .select({
        filterByFormula: `{date} = '${dateStr}'`,
        fields: ['key', 'votePubkey', 'date', 'delinquentMinutes', 'totalChecks'],
        pageSize: 100,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const votePubkey = record.get('votePubkey') as string;
          if (votePubkey) {
            existingRecordsMap.set(votePubkey, record);
          }
        });
        fetchNextPage();
      });

    console.log(`📦 Found ${existingRecordsMap.size} existing records for today`);

    // Prepare updates in batches
    const recordsToUpdate: any[] = [];
    let needsCreateCount = 0;

    for (const votePubkey of allVotePubkeys) {
      const isDelinquent = delinquentSet.has(votePubkey);
      const existing = existingRecordsMap.get(votePubkey);

      if (existing) {
        // Update existing record
        const currentDelinquentMinutes = Number(existing.get('delinquentMinutes') || 0);
        const currentTotalChecks = Number(existing.get('totalChecks') || 0);
        
        const newDelinquentMinutes = isDelinquent ? currentDelinquentMinutes + 1 : currentDelinquentMinutes;
        const newTotalChecks = currentTotalChecks + 1;
        const newUptimePercent = newTotalChecks > 0 
          ? 100 - ((newDelinquentMinutes / newTotalChecks) * 100)
          : 100;

        recordsToUpdate.push({
          id: existing.id,
          fields: {
            delinquentMinutes: newDelinquentMinutes,
            totalChecks: newTotalChecks,
            uptimePercent: Math.round(newUptimePercent * 100) / 100,
          }
        });
      } else {
        needsCreateCount++;
      }
    }

    // Only update, NEVER create during normal operation
    // (Records should only be created once per day at midnight or by snapshot job)
    let updated = 0;
    if (recordsToUpdate.length > 0) {
      console.log(`📝 Updating ${recordsToUpdate.length} records...`);
      for (let i = 0; i < recordsToUpdate.length; i += 10) {
        const batch = recordsToUpdate.slice(i, i + 10);
        await tb.dailyUptime.update(batch);
        updated += batch.length;
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Updated ${updated} records`);
    if (needsCreateCount > 0) {
      console.log(`⚠️  ${needsCreateCount} validators need records created (will be handled by snapshot job)`);
    }
    console.log(`⏱️  Total time: ${elapsed}ms`);
    console.log(`🩺 === DELINQUENCY CHECK COMPLETE ===\n`);

    return NextResponse.json({
      success: true,
      date: dateStr,
      totalValidators: allVotePubkeys.length,
      delinquent: delinquentSet.size,
      active: allVotePubkeys.length - delinquentSet.size,
      updated,
      skipped: needsCreateCount,
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

