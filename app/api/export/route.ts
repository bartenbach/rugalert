import { sql } from '@/lib/db-neon'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await sql`
      SELECT vote_pubkey, epoch, from_commission, to_commission, delta
      FROM events
      WHERE type = 'RUG'
      ORDER BY epoch DESC
    `
    
    const header = ['vote_pubkey','epoch','from','to','delta']
    const data = rows.map(r => [r.vote_pubkey, r.epoch, r.from_commission, r.to_commission, r.delta])
    const csv = [header, ...data].map(r => r.join(',')).join('\n')
    return new Response(csv, { headers: { 'Content-Type': 'text/csv' } })
  } catch (error: any) {
    return new Response(`Error: ${error.message}`, { status: 500 })
  }
}
