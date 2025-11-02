import { sql } from '@/lib/db-neon'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const page = Number(url.searchParams.get('page') ?? '1')
    const pageSize = 50
    const offset = (page - 1) * pageSize

    // Get total count
    const countResult = await sql`SELECT COUNT(*) as count FROM events`
    const total = Number(countResult[0]?.count || 0)

    // Get paginated events with validator info
    const results = await sql`
      SELECT 
        e.id,
        e.vote_pubkey,
        e.type,
        e.from_commission as "fromCommission",
        e.to_commission as "toCommission",
        e.delta,
        e.epoch,
        v.name,
        v.icon_url as avatar_url
      FROM events e
      LEFT JOIN validators v ON e.vote_pubkey = v.vote_pubkey
      ORDER BY e.created_at DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `

    return NextResponse.json({ items: results, total, page, pageSize })
  } catch (error: any) {
    console.error('❌ History error:', error)
    return NextResponse.json({ items: [], total: 0, error: error.message }, { status: 500 })
  }
}
