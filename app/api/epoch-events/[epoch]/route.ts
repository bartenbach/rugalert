import { sql } from '@/lib/db-neon'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { epoch: string } }
) {
  try {
    const epoch = Number(params.epoch)
    
    if (isNaN(epoch)) {
      return NextResponse.json({ error: 'Invalid epoch' }, { status: 400 })
    }
    
    // Fetch BOTH commission RUG events AND MEV RUG events for this epoch
    const commissionRugs = await sql`
      SELECT 
        e.id,
        e.vote_pubkey,
        e.type,
        e.from_commission,
        e.to_commission,
        e.delta,
        e.epoch,
        e.created_at,
        v.name,
        v.icon_url
      FROM events e
      LEFT JOIN validators v ON e.vote_pubkey = v.vote_pubkey
      WHERE e.type = 'RUG' AND e.epoch = ${epoch}
      ORDER BY e.created_at DESC
    `
    
    console.log(`📊 Epoch ${epoch} DEBUG: Found ${commissionRugs.length} commission rugs`)
    if (commissionRugs.length > 0) {
      console.log('First 3 commission rugs:', commissionRugs.slice(0, 3).map(r => ({ 
        name: r.name, 
        vote_pubkey: String(r.vote_pubkey).substring(0, 8),
        from: r.from_commission,
        to: r.to_commission 
      })))
    }
    
    const mevRugs = await sql`
      SELECT 
        m.id,
        m.vote_pubkey,
        m.type,
        m.from_mev_commission as from_commission,
        m.to_mev_commission as to_commission,
        m.from_mev_commission IS NULL as from_disabled,
        m.to_mev_commission IS NULL as to_disabled,
        m.delta,
        m.epoch,
        m.created_at,
        v.name,
        v.icon_url
      FROM mev_events m
      LEFT JOIN validators v ON m.vote_pubkey = v.vote_pubkey
      WHERE m.type = 'RUG' AND m.epoch = ${epoch}
      ORDER BY m.created_at DESC
    `
    
    console.log(`📊 Epoch ${epoch} DEBUG: Found ${mevRugs.length} MEV rugs`)
    if (mevRugs.length > 0) {
      console.log('First 3 MEV rugs:', mevRugs.slice(0, 3).map(r => ({ 
        name: r.name, 
        vote_pubkey: String(r.vote_pubkey).substring(0, 8),
        from: r.from_commission,
        to: r.to_commission,
        from_disabled: r.from_disabled,
        to_disabled: r.to_disabled
      })))
    }
    
    // Deduplicate within each type (keep only the latest event per validator per type)
    // But DO show BOTH commission AND MEV if a validator did both
    const seenCommission = new Map<string, any>()
    const seenMEV = new Map<string, any>()
    
    // Keep only the most recent commission rug per validator
    for (const rug of commissionRugs) {
      const votePubkey = String(rug.vote_pubkey)
      if (!seenCommission.has(votePubkey)) {
        seenCommission.set(votePubkey, { ...rug, rug_type: 'COMMISSION' })
      }
    }
    
    // Keep only the most recent MEV rug per validator
    for (const rug of mevRugs) {
      const votePubkey = String(rug.vote_pubkey)
      if (!seenMEV.has(votePubkey)) {
        seenMEV.set(votePubkey, { ...rug, rug_type: 'MEV' })
      }
    }
    
    // Combine the deduplicated results
    const allRugs = [
      ...Array.from(seenCommission.values()),
      ...Array.from(seenMEV.values())
    ]
    
    // Sort by validator name/pubkey, then by type (show commission first, then MEV)
    allRugs.sort((a, b) => {
      const nameA = a.name || a.vote_pubkey
      const nameB = b.name || b.vote_pubkey
      const nameCompare = nameA.localeCompare(nameB)
      if (nameCompare !== 0) return nameCompare
      
      // Same validator - show COMMISSION first, then MEV
      if (a.rug_type === 'COMMISSION' && b.rug_type === 'MEV') return -1
      if (a.rug_type === 'MEV' && b.rug_type === 'COMMISSION') return 1
      return 0
    })
    
    const items = allRugs.map(r => ({
      id: r.id,
      vote_pubkey: r.vote_pubkey,
      type: r.type,
      rug_type: r.rug_type,  // 'COMMISSION' or 'MEV'
      from_commission: r.from_commission,
      to_commission: r.to_commission,
      from_disabled: r.from_disabled || false,
      to_disabled: r.to_disabled || false,
      delta: r.delta,
      epoch: r.epoch,
      created_at: r.created_at,
      name: r.name || null,
      icon_url: r.icon_url || null,
    }))
    
    const uniqueValidators = new Set(allRugs.map(r => r.vote_pubkey)).size
    console.log(`📊 Epoch ${epoch}: ${seenCommission.size} unique commission + ${seenMEV.size} unique MEV = ${allRugs.length} rows from ${uniqueValidators} unique validators`)
    
    return NextResponse.json({ items }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      }
    })
  } catch (e: any) {
    console.error('❌ epoch-events error:', e)
    return NextResponse.json({ 
      items: [], 
      error: String(e?.message || e) 
    }, { status: 500 })
  }
}
