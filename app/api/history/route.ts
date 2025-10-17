import { pagedEvents, tb } from '@/lib/airtable'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = 50
  const { items, total } = await pagedEvents(page, pageSize)

  // hydrate
  const results = await Promise.all(items.map(async (r:any) => {
    const vp = r.get('votePubkey')
    const v = await tb.validators.select({ filterByFormula: `{votePubkey} = "${vp}"`, maxRecords: 1 }).firstPage()
    return {
      id: r.id,
      vote_pubkey: vp,
      type: r.get('type') || 'INFO',
      name: v[0]?.get('name') || null,
      avatar_url: v[0]?.get('iconUrl') || null,
      fromCommission: r.get('fromCommission'),
      toCommission: r.get('toCommission'),
      delta: r.get('delta'),
      epoch: r.get('epoch'),
    }
  }))

  return NextResponse.json({ items: results, total, page, pageSize })
}
