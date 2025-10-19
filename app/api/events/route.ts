import { NextRequest, NextResponse } from 'next/server'
import { tb } from '../../../lib/airtable'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const epochs = Number(new URL(req.url).searchParams.get('epochs') ?? '10')
    
    // Try to get latest epoch from snapshots first, fall back to events if empty
    let latestSnapshot = await tb.snapshots.select({ sort: [{ field: 'epoch', direction: 'desc' }], maxRecords: 1 }).firstPage()
    let latestEpoch = latestSnapshot[0]?.get('epoch') as number | undefined
    
    // If no snapshots exist, get latest epoch from events table
    if (!latestEpoch) {
      const latestEvent = await tb.events.select({ sort: [{ field: 'epoch', direction: 'desc' }], maxRecords: 1 }).firstPage()
      latestEpoch = latestEvent[0]?.get('epoch') as number | undefined
    }
    
    // If still no epoch found, return empty (truly no data)
    if (!latestEpoch) return NextResponse.json({ items: [] })
    
    const minEpoch = Number(latestEpoch) - epochs

    // latest event per validator since minEpoch
    const all: any[] = []
    await tb.events.select({
      filterByFormula: `{epoch} >= ${minEpoch}`,
      sort: [{ field: 'epoch', direction: 'desc' }],
      pageSize: 100
    }).eachPage((recs, next) => { all.push(...recs); next() })
    
    // Sort by createdTime (descending) to get truly latest events within same epoch
    all.sort((a, b) => {
      const timeA = new Date(a._rawJson.createdTime).getTime()
      const timeB = new Date(b._rawJson.createdTime).getTime()
      return timeB - timeA // Descending (newest first)
    })

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