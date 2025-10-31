import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../lib/db-neon'

// Cache for 2 minutes to improve performance
export const revalidate = 120

export async function GET(req: NextRequest) {
  try {
    const epochs = Number(new URL(req.url).searchParams.get('epochs') ?? '10')
    const showAll = new URL(req.url).searchParams.get('showAll') === 'true'
    
    // Get latest epoch from snapshots first, fall back to events if empty
    const latestSnapshotRow = await sql`
      SELECT epoch FROM snapshots ORDER BY epoch DESC LIMIT 1
    `
    let latestEpoch = latestSnapshotRow[0]?.epoch
    
    // If no snapshots exist, get latest epoch from events table
    if (!latestEpoch) {
      const latestEventRow = await sql`
        SELECT epoch FROM events ORDER BY epoch DESC LIMIT 1
      `
      latestEpoch = latestEventRow[0]?.epoch
    }
    
    // If still no epoch found, return empty (truly no data)
    if (!latestEpoch) return NextResponse.json({ items: [] })
    
    const minEpoch = Number(latestEpoch) - epochs

    // Fetch all events in the epoch range
    const all = await sql`
      SELECT 
        id,
        vote_pubkey,
        type,
        from_commission,
        to_commission,
        delta,
        epoch,
        created_at
      FROM events
      WHERE epoch >= ${minEpoch}
      ORDER BY epoch DESC, created_at DESC
    `
    
    console.log(`📊 Found ${all.length} total events in epochs ${minEpoch}-${latestEpoch}, showAll=${showAll}`)
    
    // Pre-fetch ALL validators once to avoid N+1 queries
    const validatorsMap = new Map<string, any>()
    const validators = await sql`
      SELECT vote_pubkey, name, icon_url, delinquent
      FROM validators
    `
    
    validators.forEach((record: any) => {
      validatorsMap.set(record.vote_pubkey, {
        name: record.name || null,
        iconUrl: record.icon_url || null,
        delinquent: Boolean(record.delinquent),
      })
    })
    
    // If showAll=true (INFO filter enabled), return ALL events
    if (showAll) {
      const allEvents = all.map((r: any) => {
        const v = validatorsMap.get(r.vote_pubkey) || { name: null, iconUrl: null, delinquent: false }
        return {
          id: r.id,
          vote_pubkey: r.vote_pubkey,
          type: r.type,
          from_commission: r.from_commission,
          to_commission: r.to_commission,
          delta: r.delta,
          epoch: r.epoch,
          created_at: r.created_at,
          name: v.name,
          icon_url: v.iconUrl,
          delinquent: v.delinquent,
        }
      })
      
      console.log(`📊 Returning ${allEvents.length} events (ALL events mode)`)
      return NextResponse.json({ items: allEvents })
    }
    
    // Otherwise, return only the most severe event per validator
    const eventsByValidator = new Map<string, any[]>()
    for (const r of all) {
      const vp = r.vote_pubkey
      if (!eventsByValidator.has(vp)) {
        eventsByValidator.set(vp, [])
      }
      eventsByValidator.get(vp)!.push(r)
    }
    
    // For each validator, pick the MOST SEVERE event (RUG > CAUTION > INFO)
    const severityOrder: Record<string, number> = { "RUG": 3, "CAUTION": 2, "INFO": 1 }
    
    const latestPer = []
    for (const [vp, events] of eventsByValidator) {
      // Sort by severity DESC, then by createdTime DESC
      events.sort((a, b) => {
        const sevA = severityOrder[a.type] ?? 0
        const sevB = severityOrder[b.type] ?? 0
        if (sevA !== sevB) return sevB - sevA
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      
      // Pick the most severe (first after sort)
      const chosen = events[0]
      const v = validatorsMap.get(vp) || { name: null, iconUrl: null, delinquent: false }
      
      latestPer.push({
        id: chosen.id,
        vote_pubkey: vp,
        type: chosen.type,
        from_commission: chosen.from_commission,
        to_commission: chosen.to_commission,
        delta: chosen.delta,
        epoch: chosen.epoch,
        created_at: chosen.created_at,
        name: v.name,
        icon_url: v.iconUrl,
        delinquent: v.delinquent,
      })
    }
    
    // Sort by createdTime DESC
    latestPer.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    console.log(`📊 Returning ${latestPer.length} events (most severe per validator)`)
    return NextResponse.json({ items: latestPer })
  } catch (err: any) {
    console.error('events/route error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
