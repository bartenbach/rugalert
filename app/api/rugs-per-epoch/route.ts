import { tb } from '@/lib/airtable'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const epochs = Number(new URL(req.url).searchParams.get('epochs') ?? '10')
    
    // Get latest epoch to determine range
    let latestSnapshot = await tb.snapshots.select({ sort: [{ field: 'epoch', direction: 'desc' }], maxRecords: 1 }).firstPage()
    let latestEpoch = latestSnapshot[0]?.get('epoch') as number | undefined
    
    if (!latestEpoch) {
      const latestEvent = await tb.events.select({ sort: [{ field: 'epoch', direction: 'desc' }], maxRecords: 1 }).firstPage()
      latestEpoch = latestEvent[0]?.get('epoch') as number | undefined
    }
    
    if (!latestEpoch) {
      return NextResponse.json({ data: [] })
    }
    
    const minEpoch = Number(latestEpoch) - epochs
    
    // Fetch RUG events only in the displayed epoch range
    const allRugs: any[] = []
    await tb.events.select({
      filterByFormula: `AND({type} = "RUG", {epoch} >= ${minEpoch})`,
      sort: [{ field: 'epoch', direction: 'desc' }],
    }).eachPage((records, fetchNextPage) => {
      allRugs.push(...records)
      fetchNextPage()
    })
    
    // Sort by createdTime (descending) to get truly latest events
    allRugs.sort((a, b) => {
      const timeA = new Date(a._rawJson.createdTime).getTime()
      const timeB = new Date(b._rawJson.createdTime).getTime()
      return timeB - timeA
    })

    console.log(`📊 Found ${allRugs.length} RUG events in epochs ${minEpoch}-${latestEpoch}`)
    
    // Group by epoch, but only count UNIQUE validators per epoch
    // AND only count the LATEST event per validator (in case of multiple events)
    const latestRugPerValidator = new Map<string, any>()
    
    for (const rug of allRugs) {
      const votePubkey = rug.get('votePubkey') as string
      const type = rug.get('type') as string
      
      // Only keep the first (latest due to sort order) RUG per validator
      if (type === "RUG" && !latestRugPerValidator.has(votePubkey)) {
        latestRugPerValidator.set(votePubkey, rug)
      }
    }
    
    // Now count by epoch
    const rugsByEpoch = new Map<number, Set<string>>()
    
    for (const rug of latestRugPerValidator.values()) {
      const epoch = rug.get('epoch') as number
      const votePubkey = rug.get('votePubkey') as string
      
      if (!rugsByEpoch.has(epoch)) {
        rugsByEpoch.set(epoch, new Set())
      }
      rugsByEpoch.get(epoch)!.add(votePubkey)
    }

    // Convert to array and count unique validators per epoch
    const data = Array.from(rugsByEpoch.entries())
      .map(([epoch, validators]) => ({ 
        epoch, 
        count: validators.size
      }))
      .sort((a, b) => a.epoch - b.epoch)

    const totalUniqueRugs = data.reduce((sum, d) => sum + d.count, 0)
    console.log(`📊 Returning ${data.length} epochs with ${totalUniqueRugs} unique rugged validators (latest events only)`)

    return NextResponse.json({ data })
  } catch (e: any) {
    console.error('❌ rugs-per-epoch error:', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

