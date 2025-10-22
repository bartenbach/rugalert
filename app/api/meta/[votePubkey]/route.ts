import { tb } from '@/lib/airtable'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(_: NextRequest, { params }: { params: { votePubkey: string } }) {
  const v = await tb.validators.select({ filterByFormula: `{votePubkey} = "${params.votePubkey}"`, maxRecords: 1 }).firstPage()
  const meta = v[0] ? { 
    name: v[0].get('name'), 
    avatarUrl: v[0].get('iconUrl'),
    website: v[0].get('website'),
    description: v[0].get('description'),
  } : null
  return NextResponse.json({ meta })
}
