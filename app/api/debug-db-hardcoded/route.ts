import { sql } from '@/lib/db-neon'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Run query with HARDCODED string (no parameter)
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
      WHERE e.vote_pubkey = 'DXv73X82WCjVMsqDszK3z764tTJMU3nPXyCU3UktudBG'
      ORDER BY e.created_at DESC
    `
    
    return NextResponse.json({
      hardcoded_count: events.length,
      event_ids: events.map(e => e.id),
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

