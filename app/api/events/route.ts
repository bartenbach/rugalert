import { NextRequest, NextResponse } from 'next/server'
import { tb } from '../../../lib/airtable'

export async function GET(req: NextRequest) {
  try {
    const epochs = Number(new URL(req.url).searchParams.get('epochs') ?? '10')
    const latest = await tb.snapshots.select({ sort: [{ field: 'epoch', direction: 'desc' }], maxRecords: 1 }).firstPage()
    if (!latest[0]) return NextResponse.json({ items: [] })
    const minEpoch = Number(latest[0].get('epoch')) - epochs

    // latest event per validator since minEpoch
    const all: any[] = []
    await tb.events.select({
      filterByFormula: `{epoch} >= ${minEpoch}`,
      sort: [{ field: 'epoch', direction: 'desc' }],
      pageSize: 100
    }).eachPage((recs, next) => { all.push(...recs); next() })

    const seen = new Set<string>()
    const latestPer: any[] = []
    for (const r of all) {
      const vp = String(r.get('votePubkey'))
      if (seen.has(vp)) continue
      seen.add(vp)

      const v = await tb.validators.select({ filterByFormula: `{votePubkey} = "${vp}"`, maxRecords: 1 }).firstPage()
      latestPer.push({
        id: r.id,
        vote_pubkey: vp,
        type: r.get('type'),
        from_commission: r.get('fromCommission'),
        to_commission: r.get('toCommission'),
        delta: r.get('delta'),
        epoch: r.get('epoch'),
        name: v[0]?.get('name') || null,
        icon_url: v[0]?.get('iconUrl') || null,  // ← use correct column
      })
    }

    return NextResponse.json({ items: latestPer })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: String(e?.message || e) }, { status: 500 })
  }
}