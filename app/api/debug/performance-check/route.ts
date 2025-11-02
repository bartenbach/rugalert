import { sql } from "@/lib/db-neon";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const votePubkey = searchParams.get("votePubkey");
    
    if (!votePubkey) {
      return NextResponse.json({ error: "votePubkey required" }, { status: 400 });
    }

    // Fetch the latest performance record for this validator from postgres
    const perfRecords = await sql`
      SELECT * FROM performance_history
      WHERE vote_pubkey = ${votePubkey}
      ORDER BY epoch DESC
      LIMIT 1
    `;

    if (perfRecords.length === 0) {
      return NextResponse.json({ error: "No performance records found" }, { status: 404 });
    }

    const record = perfRecords[0];

    // Log all fields to see exactly what's in the database
    console.log("Performance record fields:", JSON.stringify(record, null, 2));

    return NextResponse.json({
      votePubkey,
      epoch: record.epoch,
      skipRate: record.skip_rate,
      leaderSlots: record.leader_slots,
      blocksProduced: record.blocks_produced,
      voteCredits: record.vote_credits,
      voteCreditsPercentage: record.vote_credits_percentage,
      maxPossibleCredits: record.max_possible_credits,
      allFields: record,
      allFieldNames: Object.keys(record),
    }, {
      headers: {
        'Cache-Control': 'no-store',
      }
    });
  } catch (error: any) {
    console.error("Performance check error:", error);
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}

