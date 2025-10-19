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

    // Group by epoch and count
    const rugsByEpoch = new Map<number, number>()
    
    for (const rug of allRugs) {
      const epoch = rug.get('epoch') as number
      rugsByEpoch.set(epoch, (rugsByEpoch.get(epoch) || 0) + 1)
    }

    // Convert to array and sort by epoch
    const data = Array.from(rugsByEpoch.entries())
      .map(([epoch, count]) => ({ epoch, count }))
      .sort((a, b) => a.epoch - b.epoch)

    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

