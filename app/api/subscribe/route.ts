import { NextRequest, NextResponse } from 'next/server'
import { tb } from '@/lib/airtable'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email || typeof email !== 'string') return NextResponse.json({ error: 'invalid' }, { status: 400 })
  // upsert by email
  const found = await tb.subs.select({ filterByFormula: `{email} = "${email}"`, maxRecords: 1 }).firstPage()
  if (found[0]) return NextResponse.json({ ok: true })
  await tb.subs.create([{ fields: { email } }])
  return NextResponse.json({ ok: true })
}
