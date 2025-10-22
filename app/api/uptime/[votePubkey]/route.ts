import { NextRequest, NextResponse } from "next/server";
import { tb } from "../../../../lib/airtable";

export const dynamic = 'force-dynamic';

/**
 * Fetch daily uptime records for yearly chart
 */
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

    // Calculate date range (last 365 days)
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);

    const endDate = today.toISOString().split('T')[0];
    const startDate = oneYearAgo.toISOString().split('T')[0];

    console.log(`📅 Fetching uptime for ${votePubkey.substring(0, 8)}... from ${startDate} to ${endDate}`);

    // Fetch daily uptime records
    const dailyRecords: any[] = [];
    await tb.dailyUptime
      .select({
        filterByFormula: `AND({votePubkey} = "${votePubkey}", {date} >= "${startDate}", {date} <= "${endDate}")`,
        sort: [{ field: 'date', direction: 'asc' }],
        fields: ['date', 'uptimeChecks', 'delinquentChecks', 'uptimePercent'],
        pageSize: 100,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          dailyRecords.push({
            date: record.get('date') as string,
            uptimeChecks: Number(record.get('uptimeChecks') || 0),
            delinquentChecks: Number(record.get('delinquentChecks') || 0),
            uptimePercent: Number(record.get('uptimePercent') || 100),
          });
        });
        fetchNextPage();
      });

    console.log(`📊 Found ${dailyRecords.length} days of uptime data`);

    // Calculate overall stats
    const totalChecks = dailyRecords.reduce((sum, day) => sum + day.uptimeChecks, 0);
    const totalDelinquent = dailyRecords.reduce((sum, day) => sum + day.delinquentChecks, 0);
    const overallUptime = totalChecks > 0 
      ? ((totalChecks - totalDelinquent) / totalChecks) * 100
      : 100;

    return NextResponse.json({
      votePubkey,
      startDate,
      endDate,
      days: dailyRecords,
      overallUptime: Math.round(overallUptime * 100) / 100,
      totalChecks,
      totalDelinquent,
      daysTracked: dailyRecords.length,
    });

  } catch (error: any) {
    console.error("❌ Error fetching uptime:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch uptime" },
      { status: 500 }
    );
  }
}
