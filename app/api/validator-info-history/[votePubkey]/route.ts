import { NextRequest, NextResponse } from "next/server";
import { sql } from '@/lib/db-neon';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { votePubkey: string } }
) {
  try {
    const { votePubkey } = params;

    // Fetch all info history records for this validator, sorted by date descending
    const records = await sql`
      SELECT 
        identity_pubkey as "identityPubkey",
        name,
        description,
        website,
        icon_url as "iconUrl",
        changed_at as "changedAt",
        epoch
      FROM validator_info_history
      WHERE vote_pubkey = ${votePubkey}
      ORDER BY changed_at DESC
      LIMIT 100
    `;

    return NextResponse.json({ history: records }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error("Error fetching validator info history:", error);
    return NextResponse.json(
      { error: "Failed to fetch validator info history" },
      { status: 500 }
    );
  }
}

