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
export const maxDuration = 60; // 60 seconds for Vercel Pro

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

    // Verify authorization (either from Vercel Cron or manual trigger with Bearer token)
    const authHeader = req.headers.get("authorization");
    const hasValidAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    
    if (!hasValidAuth) {
      console.error(`❌ Unauthorized request`);
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

    // Upsert daily_uptime records using Postgres ON CONFLICT
    let updated = 0;
    let created = 0;

    for (const votePubkey of allVotePubkeys) {
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
        
        // xmax = 0 means INSERT, xmax != 0 means UPDATE
        if (result[0]?.inserted) {
          created++;
        } else {
          updated++;
        }
      } catch (err) {
        console.error(`Error upserting ${votePubkey}:`, err);
      }
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
