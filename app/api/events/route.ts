import { NextRequest, NextResponse } from 'next/server'
import { tb } from '../../../lib/airtable'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const epochs = Number(new URL(req.url).searchParams.get('epochs') ?? '10')
    
    // Try to get latest epoch from snapshots first, fall back to events if empty
    let latestSnapshot = await tb.snapshots.select({ sort: [{ field: 'epoch', direction: 'desc' }], maxRecords: 1 }).firstPage()
    let latestEpoch = latestSnapshot[0]?.get('epoch') as number | undefined
    
    // If no snapshots exist, get latest epoch from events table
    if (!latestEpoch) {
      const latestEvent = await tb.events.select({ sort: [{ field: 'epoch', direction: 'desc' }], maxRecords: 1 }).firstPage()
      latestEpoch = latestEvent[0]?.get('epoch') as number | undefined
    }
    
    // If still no epoch found, return empty (truly no data)
    if (!latestEpoch) return NextResponse.json({ items: [] })
    
    const minEpoch = Number(latestEpoch) - epochs

    // Fetch all events in the epoch range
    const all: any[] = []
    await tb.events.select({
      filterByFormula: `{epoch} >= ${minEpoch}`,
      sort: [{ field: 'epoch', direction: 'desc' }],
      pageSize: 100
    }).eachPage((recs, next) => { all.push(...recs); next() })
    
    console.log(`📊 Found ${all.length} total events in epochs ${minEpoch}-${latestEpoch}`)
    
    // Group events by validator
    const eventsByValidator = new Map<string, any[]>()
    for (const r of all) {
      const vp = String(r.get('votePubkey'))
      if (!eventsByValidator.has(vp)) {
        eventsByValidator.set(vp, [])
      }
      eventsByValidator.get(vp)!.push(r)
    }
    
    // For each validator, pick the MOST SEVERE event (RUG > CAUTION > INFO)
    // If multiple events of same severity, pick the latest by createdTime
    const severityOrder: Record<string, number> = { "RUG": 3, "CAUTION": 2, "INFO": 1 }
    
    const latestPer: any[] = []
    for (const [vp, events] of eventsByValidator.entries()) {
      // Sort by severity (descending) then by createdTime (descending)
      events.sort((a, b) => {
        const typeA = String(a.get('type'))
        const typeB = String(b.get('type'))
        const severityA = severityOrder[typeA] || 0
        const severityB = severityOrder[typeB] || 0
        
        if (severityA !== severityB) {
          return severityB - severityA // Higher severity first
        }
        
        // Same severity, use createdTime
        const timeA = new Date(a._rawJson.createdTime).getTime()
        const timeB = new Date(b._rawJson.createdTime).getTime()
        return timeB - timeA // Newer first
      })
      
      // Take the first event (most severe, or latest if same severity)
      const r = events[0]
      
      const v = await tb.validators.select({ filterByFormula: `{votePubkey} = "${vp}"`, maxRecords: 1 }).firstPage()
      latestPer.push({
        id: r.id,
        vote_pubkey: vp,
        type: r.get('type'),
        from_commission: r.get('fromCommission'),
        to_commission: r.get('toCommission'),
        delta: r.get('delta'),
        epoch: r.get('epoch'),
        name: v[0]?.get('name') || null,
        icon_url: v[0]?.get('iconUrl') || null,
      })
    }
    
    console.log(`📊 Returning ${latestPer.length} validators (prioritized by severity: RUG > CAUTION > INFO)`)

    return NextResponse.json({ items: latestPer })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: String(e?.message || e) }, { status: 500 })
  }
}