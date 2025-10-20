import { tb } from '@/lib/airtable'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { votePubkey: string } }
) {
  try {
    const votePubkey = params.votePubkey
    
    // Fetch all events for this specific validator
    const events: any[] = []
    await tb.events.select({
      filterByFormula: `{votePubkey} = "${votePubkey}"`,
      sort: [{ field: 'epoch', direction: 'desc' }],
      pageSize: 100
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
    
    // Get validator metadata
    const validator = await tb.validators.select({ 
      filterByFormula: `{votePubkey} = "${votePubkey}"`, 
      maxRecords: 1 
    }).firstPage()
    
    const items = events.map(r => ({
      id: r.id,
      vote_pubkey: votePubkey,
      type: r.get('type'),
      from_commission: r.get('fromCommission'),
      to_commission: r.get('toCommission'),
      delta: r.get('delta'),
      epoch: r.get('epoch'),
      name: validator[0]?.get('name') || null,
      icon_url: validator[0]?.get('iconUrl') || null,
    }))
    
    console.log(`📊 Returning ${items.length} events for validator ${votePubkey}`)
    
    return NextResponse.json({ items })
  } catch (e: any) {
    console.error('❌ validator-events error:', e)
    return NextResponse.json({ 
      items: [], 
      error: String(e?.message || e) 
    }, { status: 500 })
  }
}

