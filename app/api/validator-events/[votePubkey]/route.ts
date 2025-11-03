import { sql } from '@/lib/db-neon'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { votePubkey: string } }
) {
  try {
    const votePubkey = params.votePubkey
    
    // Fetch validator info separately to avoid JOIN multiplication bug
    const validators = await sql`
      SELECT name, icon_url
      FROM validators
      WHERE vote_pubkey = ${votePubkey}
      LIMIT 1
    `
    const validator = validators[0]
    
    // Fetch inflation commission events
    const inflationEvents = await sql`
      SELECT 
        id,
        vote_pubkey,
        type,
        from_commission,
        to_commission,
        delta,
        epoch,
        created_at,
        'INFLATION' as commission_type
      FROM events
      WHERE vote_pubkey = ${votePubkey}
      ORDER BY created_at DESC
    `
    
    // Fetch MEV commission events
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
        'MEV' as commission_type
      FROM mev_events
      WHERE vote_pubkey = ${votePubkey}
      ORDER BY created_at DESC
    `
    
    // Merge and sort by created_at DESC
    const allEvents = [...inflationEvents, ...mevEvents].sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    
    // Add validator info to each event
    const enrichedEvents = allEvents.map(e => ({
      ...e,
      name: validator?.name || null,
      icon_url: validator?.icon_url || null
    }))
    
    console.log(`📊 Returning ${enrichedEvents.length} events for validator ${votePubkey} (${inflationEvents.length} inflation, ${mevEvents.length} MEV)`)
    
    return NextResponse.json({ items: enrichedEvents }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      }
    })
  } catch (e: any) {
    console.error('❌ validator-events error:', e)
    return NextResponse.json({ 
      items: [], 
      error: String(e?.message || e) 
    }, { status: 500 })
  }
}

