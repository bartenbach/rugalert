import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../lib/db-neon'

// Force dynamic rendering (query params)
export const dynamic = 'force-dynamic'

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
    if (!latestEpoch) return NextResponse.json({ items: [] }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      }
    })
    
    const minEpoch = Number(latestEpoch) - epochs

    // Fetch all inflation commission events
    // Force exact epoch match to avoid any query planner issues
    const commissionEvents = await sql`
      SELECT 
        id,
        vote_pubkey,
        type,
        from_commission,
        to_commission,
        delta,
        epoch,
        created_at,
        'COMMISSION' as event_source
      FROM events
      WHERE epoch >= ${minEpoch} AND epoch <= ${latestEpoch}
      ORDER BY epoch DESC, created_at DESC
    `
    
    // Fetch all MEV commission events
    const mevEvents = await sql`
      SELECT 
        id,
        vote_pubkey,
        type,
        from_mev_commission as from_commission,
        to_mev_commission as to_commission,
        delta,
        epoch,
        created_at,
        'MEV' as event_source,
        from_mev_commission IS NULL as from_disabled,
        to_mev_commission IS NULL as to_disabled
      FROM mev_events
      WHERE epoch >= ${minEpoch} AND epoch <= ${latestEpoch}
      ORDER BY epoch DESC, created_at DESC
    `
    
    // Combine both types of events
    const all = [...commissionEvents, ...mevEvents].sort((a, b) => {
      // Sort by epoch DESC, then created_at DESC
      if (a.epoch !== b.epoch) return b.epoch - a.epoch
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    
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
          event_source: r.event_source, // 'COMMISSION' or 'MEV'
          from_disabled: r.from_disabled || false,
          to_disabled: r.to_disabled || false,
          name: v.name,
          icon_url: v.iconUrl,
          delinquent: v.delinquent,
        }
      })
      
      return NextResponse.json({ items: allEvents }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'CDN-Cache-Control': 'no-store',
          'Vercel-CDN-Cache-Control': 'no-store',
        }
      })
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
        event_source: chosen.event_source, // 'COMMISSION' or 'MEV'
        from_disabled: chosen.from_disabled || false,
        to_disabled: chosen.to_disabled || false,
        name: v.name,
        icon_url: v.iconUrl,
        delinquent: v.delinquent,
      })
    }
    
    // Sort by createdTime DESC
    latestPer.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    // DEBUG: Log the difference between epoch counts
    console.log(`📊 FINAL: ${latestPer.length} unique validators after dedup (from ${all.length} total events, ${eventsByValidator.size} unique validators)`)
    console.log(`📊 Breakdown: ${latestPer.filter(e => e.type === 'RUG').length} RUG, ${latestPer.filter(e => e.type === 'CAUTION').length} CAUTION, ${latestPer.filter(e => e.type === 'INFO').length} INFO`)
    
    // Find validators that were deduped away (had events but aren't in final list)
    const finalValidators = new Set(latestPer.map(e => e.vote_pubkey))
    const droppedValidators = Array.from(eventsByValidator.keys()).filter(vp => !finalValidators.has(vp))
    if (droppedValidators.length > 0) {
      console.log(`⚠️  BUG: ${droppedValidators.length} validators had events but aren't in final list:`, droppedValidators.map(vp => String(vp).substring(0, 8)))
    }
    
    return NextResponse.json({ items: latestPer }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      }
    })
  } catch (err: any) {
    console.error('events/route error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
