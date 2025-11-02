import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db-neon'

export const dynamic = 'force-dynamic'

export async function GET(_: NextRequest, { params }: { params: { votePubkey: string } }) {
  try {
    const series = await sql`
      SELECT epoch, commission 
      FROM snapshots 
      WHERE vote_pubkey = ${params.votePubkey}
      ORDER BY epoch ASC
    `
    return NextResponse.json({ 
      series: series.map(s => ({
        epoch: s.epoch,
        commission: s.commission
      }))
    })
  } catch (error: any) {
    console.error('Series error:', error)
    return NextResponse.json({ series: [], error: error.message }, { status: 500 })
  }
}
