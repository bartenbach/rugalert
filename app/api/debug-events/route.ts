import { sql } from '@/lib/db-neon'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // Fetch latest 50 events from postgres
    const allEvents = await sql`
      SELECT type, from_commission, to_commission, epoch, vote_pubkey
      FROM events
      ORDER BY created_at DESC
      LIMIT 50
    `

    // Count by type
    const typeCounts = {
      RUG: 0,
      CAUTION: 0,
      INFO: 0,
      OTHER: 0,
    }

    const eventDetails = allEvents.map(e => {
      const type = e.type as string
      const from = e.from_commission as number
      const to = e.to_commission as number
      const epoch = e.epoch as number
      const votePubkey = e.vote_pubkey as string

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

