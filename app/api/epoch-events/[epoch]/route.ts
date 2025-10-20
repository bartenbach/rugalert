import { tb } from '@/lib/airtable'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { epoch: string } }
) {
  try {
    const epoch = Number(params.epoch)
    
    if (isNaN(epoch)) {
      return NextResponse.json({ error: 'Invalid epoch' }, { status: 400 })
    }
    
    // Fetch all RUG events for this specific epoch
    const events: any[] = []
    await tb.events.select({
      filterByFormula: `AND({type} = "RUG", {epoch} = ${epoch})`,
      sort: [{ field: 'epoch', direction: 'desc' }],
    }).eachPage((recs, next) => { 
      events.push(...recs)
      next() 
    })
    
    // Sort by createdTime (descending) for accurate ordering
    events.sort((a, b) => {
      const timeA = new Date(a._rawJson.createdTime).getTime()
      const timeB = new Date(b._rawJson.createdTime).getTime()
      return timeB - timeA
    })
    
    // Get validator metadata for each event
    const items = await Promise.all(
      events.map(async (r) => {
        const vp = String(r.get('votePubkey'))
        const validator = await tb.validators.select({ 
          filterByFormula: `{votePubkey} = "${vp}"`, 
          maxRecords: 1 
        }).firstPage()
        
        return {
          id: r.id,
          vote_pubkey: vp,
          type: r.get('type'),
          from_commission: r.get('fromCommission'),
          to_commission: r.get('toCommission'),
          delta: r.get('delta'),
          epoch: r.get('epoch'),
          created_at: r._rawJson.createdTime,
          name: validator[0]?.get('name') || null,
          icon_url: validator[0]?.get('iconUrl') || null,
        }
      })
    )
    
    console.log(`📊 Returning ${items.length} RUG events for epoch ${epoch}`)
    
    return NextResponse.json({ items })
  } catch (e: any) {
    console.error('❌ epoch-events error:', e)
    return NextResponse.json({ 
      items: [], 
      error: String(e?.message || e) 
    }, { status: 500 })
  }
}

