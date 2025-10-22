import { NextRequest, NextResponse } from "next/server";
import { tb } from "../../../../lib/airtable";

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { votePubkey: string } }
) {
  try {
    const { votePubkey } = params;

    if (!votePubkey) {
      return NextResponse.json(
        { error: "votePubkey is required" },
        { status: 400 }
      );
    }

    // Calculate date range (up to 365 days, or all available data)
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);

    const endDate = today.toISOString().split('T')[0];
    const startDate = oneYearAgo.toISOString().split('T')[0];

    console.log(`📅 Fetching uptime for ${votePubkey} from ${startDate} to ${endDate}`);

    // Fetch uptime records for this validator
    const allRecords: any[] = [];
    await tb.dailyUptime
      .select({
        filterByFormula: `AND({votePubkey} = "${votePubkey}", {date} >= "${startDate}", {date} <= "${endDate}")`,
        sort: [{ field: 'date', direction: 'asc' }],
        pageSize: 100,
      })
      .eachPage((pageRecords, fetchNextPage) => {
        pageRecords.forEach((record) => {
          allRecords.push({
            date: record.get('date') as string,
            delinquentMinutes: Number(record.get('delinquentMinutes') || 0),
            totalChecks: Number(record.get('totalChecks') || 0),
            uptimePercent: Number(record.get('uptimePercent') || 100),
          });
        });
        fetchNextPage();
      });

    // Only return days with actual data (totalChecks > 0 means we actually tracked that day)
    const records = allRecords.filter(r => r.totalChecks > 0);
    
    console.log(`📊 Found ${allRecords.length} total records, ${records.length} with actual data`);

    return NextResponse.json({
      votePubkey,
      startDate,
      endDate,
      days: records,
    });

  } catch (error: any) {
    console.error("❌ Error fetching uptime:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch uptime" },
      { status: 500 }
    );
  }
}

