import { sql } from '@/lib/db-neon'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { votePubkey: string } }
) {
  try {
    const votePubkey = params.votePubkey
    
    // Fetch all events for this validator (both commission and MEV)
    const events = await sql`
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
      WHERE e.vote_pubkey = ${votePubkey}
      ORDER BY e.created_at DESC
    `
    
    console.log(`📊 Returning ${events.length} events for validator ${votePubkey}`)
    console.log(`📊 Event IDs:`, events.map(e => e.id))
    console.log(`📊 First event:`, JSON.stringify(events[0]))
    
    return NextResponse.json({ items: events }, {
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

