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
    
    // epochs=1 means "show current epoch only", so minEpoch = latestEpoch
    // epochs=2 means "show current + 1 previous", so minEpoch = latestEpoch - 1
    const minEpoch = Number(latestEpoch) - epochs + 1

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
    
    // Dedup strategy: Show MOST SEVERE per (validator, epoch, event_source)
    // This means: if validator rugs in epoch 873 AND 874, show BOTH
    // But if validator has RUG + INFO in same epoch, show only the RUG
    const deduped = new Map<string, any>()
    
    for (const event of all) {
      const key = `${event.vote_pubkey}-${event.epoch}-${event.event_source}`
      const existing = deduped.get(key)
      
      if (!existing) {
        deduped.set(key, event)
      } else {
        // If there's already an event for this validator+epoch+source, keep the more severe one
        const severityOrder: Record<string, number> = { "RUG": 3, "CAUTION": 2, "INFO": 1 }
        const existingSev = severityOrder[existing.type] ?? 0
        const newSev = severityOrder[event.type] ?? 0
        
        if (newSev > existingSev) {
          deduped.set(key, event)
        } else if (newSev === existingSev) {
          // Same severity, keep the later one
          if (new Date(event.created_at).getTime() > new Date(existing.created_at).getTime()) {
            deduped.set(key, event)
          }
        }
      }
    }
    
    // Convert to array and enrich with validator info
    const enriched = Array.from(deduped.values()).map(r => {
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
        event_source: r.event_source,
        from_disabled: r.from_disabled || false,
        to_disabled: r.to_disabled || false,
        name: v.name,
        icon_url: v.iconUrl,
        delinquent: v.delinquent,
      }
    })
    
    // Sort by createdTime DESC
    enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    console.log(`📊 DEDUP: ${all.length} total events → ${enriched.length} after dedup (per validator+epoch+source)`)
    console.log(`📊 Breakdown: ${enriched.filter(e => e.type === 'RUG').length} RUG, ${enriched.filter(e => e.type === 'CAUTION').length} CAUTION, ${enriched.filter(e => e.type === 'INFO').length} INFO`)
    
    return NextResponse.json({ items: enriched }, {
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
