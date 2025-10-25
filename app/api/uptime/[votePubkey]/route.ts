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

    // Calculate date range (last 365 days) - use UTC to match database
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const oneYearAgo = new Date(todayUTC);
    oneYearAgo.setUTCDate(oneYearAgo.getUTCDate() - 365);

    const endDate = todayUTC.toISOString().split('T')[0];
    const startDate = oneYearAgo.toISOString().split('T')[0];

    console.log(`📅 Fetching uptime for ${votePubkey.substring(0, 8)}... from ${startDate} to ${endDate}`);

    // Fetch daily uptime records
    // Note: Filtering by votePubkey only, then filter by date in JS to avoid Airtable Date field comparison issues
    const allRecords: any[] = [];
    await tb.dailyUptime
      .select({
        filterByFormula: `{votePubkey} = "${votePubkey}"`,
        sort: [{ field: 'date', direction: 'asc' }],
        fields: ['date', 'uptimeChecks', 'delinquentChecks', 'uptimePercent'],
        pageSize: 100,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const uptimeChecks = Number(record.get('uptimeChecks') || 0);
          const delinquentChecks = Number(record.get('delinquentChecks') || 0);
          // ALWAYS calculate uptimePercent from raw checks (source of truth)
          const uptimePercent = uptimeChecks > 0 
            ? ((uptimeChecks - delinquentChecks) / uptimeChecks) * 100 
            : 100;
          
          allRecords.push({
            date: record.get('date') as string,
            uptimeChecks,
            delinquentChecks,
            uptimePercent,
          });
        });
        fetchNextPage();
      });
    
    // Filter by date range in JavaScript (more reliable than Airtable's Date field string comparison)
    const dailyRecords = allRecords.filter(record => {
      const recordDate = record.date;
      return recordDate >= startDate && recordDate <= endDate;
    });

    console.log(`📊 Fetched ${allRecords.length} total records, filtered to ${dailyRecords.length} days in range ${startDate} to ${endDate}`);
    if (dailyRecords.length > 0) {
      console.log(`📅 Date range in records: ${dailyRecords[0]?.date} to ${dailyRecords[dailyRecords.length - 1]?.date}`);
      console.log(`📊 All dates: ${dailyRecords.map(r => r.date).join(', ')}`);
    }

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
