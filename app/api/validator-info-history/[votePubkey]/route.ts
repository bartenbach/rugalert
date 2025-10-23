import { NextRequest, NextResponse } from "next/server";
import { tb } from "../../../../lib/airtable";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { votePubkey: string } }
) {
  try {
    const { votePubkey } = params;

    // Fetch all info history records for this validator, sorted by date descending
    const records = await tb.validatorInfoHistory.select({
      filterByFormula: `{votePubkey} = "${votePubkey}"`,
      sort: [{ field: 'changedAt', direction: 'desc' }],
      maxRecords: 100, // Limit to last 100 changes
    }).all();

    const history = records.map((r) => ({
      identityPubkey: r.get('identityPubkey') as string,
      name: r.get('name') as string | null,
      description: r.get('description') as string | null,
      website: r.get('website') as string | null,
      iconUrl: r.get('iconUrl') as string | null,
      changedAt: r.get('changedAt') as string,
      epoch: r.get('epoch') as number,
    }));

    return NextResponse.json({ history }, {
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

