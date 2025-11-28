import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db-neon";

// ---- JSON-RPC helper ----
async function rpc(method: string, params: any[] = []) {
  const res = await fetch(process.env.RPC_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(JSON.stringify(json.error || res.status));
  return json.result;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300; // 5 minutes for Vercel Pro (increased from 60s to handle all validators)

/**
 * DAILY UPTIME TRACKING:
 * - One record per validator per day
 * - UPSERT based on key = "votePubkey-date"
 * - Increment uptimeChecks and delinquentChecks for today's record
 */
export async function GET(req: NextRequest) {
  try {
    console.log(`\n🩺 === DELINQUENCY CHECK START ===`);
    const startTime = Date.now();

    // Verify authorization (Vercel cron sends user-agent, manual triggers use Bearer token)
    const authHeader = req.headers.get("authorization");
    const userAgent = req.headers.get("user-agent");
    const isVercelCron = userAgent?.includes("vercel-cron");
    const hasBearerAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    const hasValidAuth = isVercelCron || hasBearerAuth;
    
    if (!hasValidAuth) {
      console.error(`❌ Unauthorized request - userAgent: ${userAgent}, authHeader: ${authHeader ? 'present' : 'missing'}`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    console.log(`✅ Authorized: ${isVercelCron ? 'Vercel Cron' : 'Bearer Token'}`);

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const checkTimestamp = new Date().toISOString();

    // Get current delinquent validators from RPC with timeout handling
    console.log(`📡 Fetching vote accounts from RPC...`);
    let voteAccounts;
    try {
      voteAccounts = await Promise.race([
        rpc("getVoteAccounts", []),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("RPC timeout after 30s")), 30000)
        )
      ]) as any;
    } catch (rpcError: any) {
      console.error(`❌ RPC call failed:`, rpcError.message);
      return NextResponse.json(
        { error: `RPC call failed: ${rpcError.message}` },
        { status: 500 }
      );
    }
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

    // Upsert daily_uptime records using Postgres ON CONFLICT
    // OPTIMIZATION: Process validators in parallel batches for better performance
    let updated = 0;
    let created = 0;

    if (allVotePubkeys.length === 0) {
      console.log(`⚠️  No validators found in RPC response`);
      return NextResponse.json({ error: "No validators found" }, { status: 500 });
    }

    console.log(`📊 Processing ${allVotePubkeys.length} validators...`);
    
    // Process validators in parallel batches to avoid timeout
    const BATCH_SIZE = 100; // Smaller batches for better reliability
    const batches = [];
    for (let i = 0; i < allVotePubkeys.length; i += BATCH_SIZE) {
      batches.push(allVotePubkeys.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
      const promises = batch.map(async (votePubkey) => {
        const isDelinquent = delinquentSet.has(votePubkey);
        const key = `${votePubkey}-${today}`;
        
        try {
          const result = await sql`
            INSERT INTO daily_uptime (key, vote_pubkey, date, uptime_checks, delinquent_checks, uptime_percent)
            VALUES (
              ${key},
              ${votePubkey},
              ${today},
              1,
              ${isDelinquent ? 1 : 0},
              ${isDelinquent ? 0 : 100}
            )
            ON CONFLICT (key) DO UPDATE SET
              uptime_checks = daily_uptime.uptime_checks + 1,
              delinquent_checks = daily_uptime.delinquent_checks + ${isDelinquent ? 1 : 0},
              uptime_percent = ROUND(
                ((daily_uptime.uptime_checks + 1 - (daily_uptime.delinquent_checks + ${isDelinquent ? 1 : 0})) 
                / (daily_uptime.uptime_checks + 1)::numeric) * 100, 
                2
              )
            RETURNING (xmax = 0) AS inserted
          `;
          
          return result[0]?.inserted ? 'created' : 'updated';
        } catch (err) {
          console.error(`Error upserting ${votePubkey}:`, err);
          return 'error';
        }
      });

      const results = await Promise.all(promises);
      results.forEach(result => {
        if (result === 'created') created++;
        else if (result === 'updated') updated++;
      });
    }

    console.log(`📝 Updated ${updated} records, created ${created} records`);

    // Update validator delinquent status in bulk
    console.log(`📝 Updating validator delinquent statuses...`);
    let validatorsUpdated = 0;
    
    // Set all to not delinquent first
    await sql`UPDATE validators SET delinquent = false`;
    
    // Then set delinquent ones to true
    if (delinquentSet.size > 0) {
      const delinquentArray = Array.from(delinquentSet);
      await sql`
        UPDATE validators 
        SET delinquent = true 
        WHERE vote_pubkey = ANY(${delinquentArray})
      `;
      validatorsUpdated = delinquentSet.size;
    }

    const elapsed = Date.now() - startTime;
    const elapsedSeconds = (elapsed / 1000).toFixed(2);
    console.log(`✅ Updated ${updated} records, created ${created} records, updated ${validatorsUpdated} validator statuses`);
    console.log(`⏱️  Total processing time: ${elapsedSeconds}s`);
    
    // Warn if processing took too long (could cause missed checks)
    if (elapsed > 50000) {
      console.warn(`⚠️  WARNING: Processing took ${elapsedSeconds}s - may cause missed checks if cron runs every minute!`);
    }
    
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
