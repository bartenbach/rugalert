import { tb } from '@/lib/airtable'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    // Fetch all RUG events
    const allRugs: any[] = []
    await tb.events.select({
      filterByFormula: `{type} = "RUG"`,
      sort: [{ field: 'epoch', direction: 'asc' }],
    }).eachPage((records, fetchNextPage) => {
      allRugs.push(...records)
      fetchNextPage()
    })

    console.log(`📊 Found ${allRugs.length} RUG events total`)
    
    // Debug: log first few rugs to verify data
    if (allRugs.length > 0) {
      const sample = allRugs.slice(0, 3).map(r => ({
        type: r.get('type'),
        epoch: r.get('epoch'),
        from: r.get('fromCommission'),
        to: r.get('toCommission'),
      }))
      console.log('📊 Sample RUG records:', JSON.stringify(sample, null, 2))
    }

    // Group by epoch and count
    const rugsByEpoch = new Map<number, number>()
    
    for (const rug of allRugs) {
      const epoch = rug.get('epoch') as number
      const type = rug.get('type') as string
      
      // Double-check it's actually a RUG
      if (type === "RUG") {
        rugsByEpoch.set(epoch, (rugsByEpoch.get(epoch) || 0) + 1)
      } else {
        console.warn(`⚠️ Non-RUG event found in RUG query: type=${type}, epoch=${epoch}`)
      }
    }

    // Convert to array and sort by epoch
    const data = Array.from(rugsByEpoch.entries())
      .map(([epoch, count]) => ({ epoch, count }))
      .sort((a, b) => a.epoch - b.epoch)

    console.log(`📊 Returning ${data.length} epochs with rugs`)

    return NextResponse.json({ data })
  } catch (e: any) {
    console.error('❌ rugs-per-epoch error:', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

