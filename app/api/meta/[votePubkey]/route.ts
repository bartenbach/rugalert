import { sql } from '@/lib/db-neon'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0 // Disable ALL caching including Next.js route cache

export async function GET(_: NextRequest, { params }: { params: { votePubkey: string } }) {
  try {
    const v = await sql`
      SELECT name, icon_url, website, description 
      FROM validators 
      WHERE vote_pubkey = ${params.votePubkey}
      LIMIT 1
    `
    const meta = v[0] ? { 
      name: v[0].name, 
      avatarUrl: v[0].icon_url,
      website: v[0].website,
      description: v[0].description,
    } : null
    return NextResponse.json({ meta }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      }
    })
  } catch (error: any) {
    console.error('Meta error:', error)
    return NextResponse.json({ meta: null, error: error.message }, { status: 500 })
  }
}
