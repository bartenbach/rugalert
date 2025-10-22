import { NextRequest, NextResponse } from "next/server";
import { tb } from "../../../../lib/airtable";

export const dynamic = 'force-dynamic';

/**
 * Calculate uptime from delinquency EVENTS (not minute-by-minute records)
 * This is much more efficient - we only store state changes
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

    // Calculate date range (up to 365 days, or all available data)
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);

    const endDate = today.toISOString();
    const startDate = oneYearAgo.toISOString();

    console.log(`📅 Fetching delinquency events for ${votePubkey} from ${startDate.split('T')[0]} to ${endDate.split('T')[0]}`);

    // Fetch delinquency events for this validator
    const allEvents: any[] = [];
    await tb.delinquencyEvents
      .select({
        filterByFormula: `AND({votePubkey} = "${votePubkey}", {timestamp} >= "${startDate}", {timestamp} <= "${endDate}")`,
        sort: [{ field: 'timestamp', direction: 'asc' }],
        pageSize: 100,
      })
      .eachPage((pageRecords, fetchNextPage) => {
        pageRecords.forEach((record) => {
          allEvents.push({
            eventType: record.get('eventType') as string,
            timestamp: record.get('timestamp') as string,
          });
        });
        fetchNextPage();
      });

    console.log(`📊 Found ${allEvents.length} delinquency events`);

    // Calculate daily uptime from events
    // Logic: Start with 100% uptime each day, subtract time when delinquent
    const days: Map<string, { date: string; delinquentMinutes: number; uptimePercent: number }> = new Map();
    
    // Initialize all days in range
    const dayCount = Math.ceil((today.getTime() - oneYearAgo.getTime()) / (1000 * 60 * 60 * 24));
    for (let i = 0; i < dayCount; i++) {
      const date = new Date(oneYearAgo);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      days.set(dateStr, {
        date: dateStr,
        delinquentMinutes: 0,
        uptimePercent: 100,
      });
    }

    // Process events to calculate downtime
    let currentlyDelinquent = false;
    let delinquentSince: Date | null = null;

    for (const event of allEvents) {
      const eventTime = new Date(event.timestamp);
      
      if (event.eventType === 'WENT_DOWN') {
        currentlyDelinquent = true;
        delinquentSince = eventTime;
      } else if (event.eventType === 'CAME_UP' && delinquentSince) {
        // Calculate downtime duration
        const downtimeMinutes = (eventTime.getTime() - delinquentSince.getTime()) / (1000 * 60);
        
        // Distribute downtime across affected days
        let currentDate = new Date(delinquentSince);
        while (currentDate <= eventTime) {
          const dateStr = currentDate.toISOString().split('T')[0];
          const dayData = days.get(dateStr);
          if (dayData) {
            // Calculate minutes in this day
            const dayStart = new Date(currentDate);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(currentDate);
            dayEnd.setHours(23, 59, 59, 999);
            
            const periodStart = currentDate.getTime() < delinquentSince.getTime() ? delinquentSince : dayStart;
            const periodEnd = eventTime.getTime() > dayEnd.getTime() ? dayEnd : eventTime;
            
            const minutesInDay = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60);
            dayData.delinquentMinutes += minutesInDay;
            dayData.uptimePercent = Math.max(0, 100 - (dayData.delinquentMinutes / (24 * 60)) * 100);
          }
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        currentlyDelinquent = false;
        delinquentSince = null;
      }
    }

    // If still delinquent, count time until now
    if (currentlyDelinquent && delinquentSince) {
      const downtimeMinutes = (today.getTime() - delinquentSince.getTime()) / (1000 * 60);
      
      let currentDate = new Date(delinquentSince);
      while (currentDate <= today) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayData = days.get(dateStr);
        if (dayData) {
          const dayStart = new Date(currentDate);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(currentDate);
          dayEnd.setHours(23, 59, 59, 999);
          
          const periodStart = currentDate.getTime() < delinquentSince.getTime() ? delinquentSince : dayStart;
          const periodEnd = today.getTime() > dayEnd.getTime() ? dayEnd : today;
          
          const minutesInDay = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60);
          dayData.delinquentMinutes += minutesInDay;
          dayData.uptimePercent = Math.max(0, 100 - (dayData.delinquentMinutes / (24 * 60)) * 100);
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    // Convert to array and filter to only days we're tracking (days with events or today)
    const daysArray = Array.from(days.values());
    
    // For now, only show days with events or the last 30 days (to show something initially)
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
    
    const records = allEvents.length > 0 
      ? daysArray // Show all days if we have events
      : daysArray.filter(d => d.date >= thirtyDaysAgoStr); // Show last 30 days if no events yet

    console.log(`📊 Returning ${records.length} days of uptime data`);

    return NextResponse.json({
      votePubkey,
      startDate: startDate.split('T')[0],
      endDate: endDate.split('T')[0],
      days: records,
      eventsFound: allEvents.length,
    });

  } catch (error: any) {
    console.error("❌ Error fetching uptime:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch uptime" },
      { status: 500 }
    );
  }
}
