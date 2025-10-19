import { tb } from '@/lib/airtable'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    // Fetch ALL events (not filtered)
    const allEvents: any[] = []
    await tb.events.select({
      sort: [{ field: 'epoch', direction: 'desc' }],
      maxRecords: 50, // Get latest 50
    }).eachPage((records, fetchNextPage) => {
      allEvents.push(...records)
      fetchNextPage()
    })

    // Count by type
    const typeCounts = {
      RUG: 0,
      CAUTION: 0,
      INFO: 0,
      OTHER: 0,
    }

    const eventDetails = allEvents.map(e => {
      const type = e.get('type') as string
      const from = e.get('fromCommission') as number
      const to = e.get('toCommission') as number
      const epoch = e.get('epoch') as number
      const votePubkey = e.get('votePubkey') as string

      // Count types
      if (type === "RUG") typeCounts.RUG++
      else if (type === "CAUTION") typeCounts.CAUTION++
      else if (type === "INFO") typeCounts.INFO++
      else typeCounts.OTHER++

      return {
        type,
        epoch,
        from,
        to,
        delta: to - from,
        votePubkey: votePubkey.substring(0, 10) + '...',
        isActualRug: to === 100 && from < 100,
      }
    })

    return NextResponse.json({
      totalEvents: allEvents.length,
      typeCounts,
      events: eventDetails,
      note: "This shows the latest 50 events with type classification"
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

