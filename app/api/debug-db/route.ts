import { sql } from '@/lib/db-neon'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Show connection info (masked)
    const dbUrl = process.env.DATABASE_URL || 'NOT SET'
    const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':****@')
    
    // Count events for that validator
    const result = await sql`
      SELECT COUNT(*) as count
      FROM events
      WHERE vote_pubkey = 'DXv73X82WCjVMsqDszK3z764tTJMU3nPXyCU3UktudBG'
    `
    
    return NextResponse.json({
      database_url: maskedUrl,
      event_count: result[0].count,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

