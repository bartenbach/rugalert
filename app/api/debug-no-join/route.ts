import { sql } from '@/lib/db-neon'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Query WITHOUT the JOIN
    const events = await sql`
      SELECT 
        e.id,
        e.vote_pubkey,
        e.type,
        e.from_commission,
        e.to_commission,
        e.delta,
        e.epoch,
        e.created_at
      FROM events e
      WHERE e.vote_pubkey = 'DXv73X82WCjVMsqDszK3z764tTJMU3nPXyCU3UktudBG'
      ORDER BY e.created_at DESC
    `
    
    return NextResponse.json({
      no_join_count: events.length,
      event_ids: events.map(e => e.id),
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

