import { sql } from '@/lib/db-neon'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const latest = await sql`
      SELECT epoch FROM snapshots 
      ORDER BY epoch DESC 
      LIMIT 1
    `
    const ok = latest.length > 0
    return NextResponse.json({ ok, latestEpoch: latest[0]?.epoch ?? null })
  } catch (error: any) {
    console.error('Health check error:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
