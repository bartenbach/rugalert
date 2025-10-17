import { tb } from '@/lib/airtable'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email, preferences } = await req.json()
  if (!email || typeof email !== 'string') return NextResponse.json({ error: 'invalid' }, { status: 400 })
  
  // Default to "rugs_only" if not specified
  const alertPreference = preferences || 'rugs_only'
  
  // upsert by email
  const found = await tb.subs.select({ filterByFormula: `{email} = "${email}"`, maxRecords: 1 }).firstPage()
  if (found[0]) {
    // Update preferences if subscriber exists
    await tb.subs.update(found[0].id, { preferences: alertPreference })
    return NextResponse.json({ ok: true })
  }
  
  await tb.subs.create([{ fields: { email, preferences: alertPreference } }])
  return NextResponse.json({ ok: true })
}
