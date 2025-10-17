import { tb } from '@/lib/airtable'
import { NextResponse } from 'next/server'

export async function GET() {
  const latest = await tb.snapshots.select({ sort: [{ field: 'epoch', direction: 'desc' }], maxRecords: 1 }).firstPage()
  const ok = !!latest[0]
  return NextResponse.json({ ok, latestEpoch: latest[0]?.get('epoch') ?? null })
}
