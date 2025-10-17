import { NextRequest, NextResponse } from 'next/server'
import { seriesFor } from '@/lib/airtable'

export async function GET(_: NextRequest, { params }: { params: { votePubkey: string } }) {
  const series = await seriesFor(params.votePubkey)
  return NextResponse.json({ series })
}
