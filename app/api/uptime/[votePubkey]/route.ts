import { NextRequest, NextResponse } from "next/server";
import { sql } from '@/lib/db-neon';

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

    // Fetch daily uptime records from postgres
    const records = await sql`
      SELECT 
        date,
        uptime_checks as "uptimeChecks",
        delinquent_checks as "delinquentChecks"
      FROM daily_uptime
      WHERE vote_pubkey = ${votePubkey}
        AND date >= ${startDate}
        AND date <= ${endDate}
      ORDER BY date ASC
    `;

    // Calculate uptimePercent from raw checks (source of truth)
    const dailyRecords = records.map(record => {
      const uptimeChecks = Number(record.uptimeChecks || 0);
      const delinquentChecks = Number(record.delinquentChecks || 0);
      const uptimePercent = uptimeChecks > 0 
        ? ((uptimeChecks - delinquentChecks) / uptimeChecks) * 100 
        : 100;
      
      // Convert date to YYYY-MM-DD string format
      const dateObj = typeof record.date === 'string' ? new Date(record.date) : record.date;
      const dateStr = dateObj instanceof Date 
        ? dateObj.toISOString().split('T')[0]
        : String(record.date);
      
      return {
        date: dateStr,
        uptimeChecks,
        delinquentChecks,
        uptimePercent,
      };
    });

    console.log(`📊 Fetched ${dailyRecords.length} days in range ${startDate} to ${endDate}`);
    if (dailyRecords.length > 0) {
      console.log(`📅 Date range in records: ${dailyRecords[0]?.date} to ${dailyRecords[dailyRecords.length - 1]?.date}`);
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
