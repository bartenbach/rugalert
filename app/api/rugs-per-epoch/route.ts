import { tb } from '@/lib/airtable'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    // Fetch all RUG events
    const allRugs: any[] = []
    await tb.events.select({
      filterByFormula: `{type} = "RUG"`,
      sort: [{ field: 'epoch', direction: 'desc' }], // Sort desc to get latest first
    }).eachPage((records, fetchNextPage) => {
      allRugs.push(...records)
      fetchNextPage()
    })

    console.log(`📊 Found ${allRugs.length} total RUG events`)
    
    // Group by epoch, but only count UNIQUE validators per epoch
    // This matches the dashboard behavior of showing one event per validator
    const rugsByEpoch = new Map<number, Set<string>>()
    
    for (const rug of allRugs) {
      const epoch = rug.get('epoch') as number
      const votePubkey = rug.get('votePubkey') as string
      const type = rug.get('type') as string
      
      // Double-check it's actually a RUG
      if (type === "RUG") {
        if (!rugsByEpoch.has(epoch)) {
          rugsByEpoch.set(epoch, new Set())
        }
        // Add validator to the set (automatically deduplicates)
        rugsByEpoch.get(epoch)!.add(votePubkey)
      } else {
        console.warn(`⚠️ Non-RUG event found in RUG query: type=${type}, epoch=${epoch}`)
      }
    }

    // Convert to array and count unique validators per epoch
    const data = Array.from(rugsByEpoch.entries())
      .map(([epoch, validators]) => ({ 
        epoch, 
        count: validators.size // Count unique validators
      }))
      .sort((a, b) => a.epoch - b.epoch)

    const totalUniqueRugs = data.reduce((sum, d) => sum + d.count, 0)
    console.log(`📊 Returning ${data.length} epochs with ${totalUniqueRugs} unique rugged validators`)

    return NextResponse.json({ data })
  } catch (e: any) {
    console.error('❌ rugs-per-epoch error:', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

