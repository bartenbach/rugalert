import { sql } from '@/lib/db-neon'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const epochs = Number(new URL(req.url).searchParams.get('epochs') ?? '10')
    const offset = Number(new URL(req.url).searchParams.get('offset') ?? '0')
    
    // Get latest epoch to determine range
    const latestSnapshotRow = await sql`SELECT epoch FROM snapshots ORDER BY epoch DESC LIMIT 1`
    let latestEpoch = latestSnapshotRow[0]?.epoch
    
    if (!latestEpoch) {
      const latestEventRow = await sql`SELECT epoch FROM events ORDER BY epoch DESC LIMIT 1`
      latestEpoch = latestEventRow[0]?.epoch
    }
    
    if (!latestEpoch) {
      return NextResponse.json({ data: [] })
    }
    
    // Apply offset: offset=0 shows most recent, offset=10 shows 10 epochs back
    const adjustedLatest = Number(latestEpoch) - offset
    const minEpoch = adjustedLatest - epochs + 1
    
    console.log(`📊 Querying rugs: latestEpoch=${latestEpoch}, adjustedLatest=${adjustedLatest}, minEpoch=${minEpoch}, range=${epochs}, offset=${offset}`)
    
    // Fetch BOTH commission RUGs and MEV RUGs within the paginated range
    const commissionRugs = await sql`
      SELECT vote_pubkey, epoch, type, created_at
      FROM events 
      WHERE type = 'RUG' AND epoch >= ${minEpoch} AND epoch <= ${adjustedLatest}
      ORDER BY created_at DESC
    `
    
    const mevRugs = await sql`
      SELECT vote_pubkey, epoch, type, created_at
      FROM mev_events 
      WHERE type = 'RUG' AND epoch >= ${minEpoch} AND epoch <= ${adjustedLatest}
      ORDER BY created_at DESC
    `

    console.log(`📊 Found ${commissionRugs.length} commission RUGs + ${mevRugs.length} MEV RUGs in epochs ${minEpoch}-${latestEpoch}`)
    console.log(`📊 Commission epochs: ${[...new Set(commissionRugs.map(r => r.epoch))].sort((a,b) => a-b).join(', ')}`)
    console.log(`📊 MEV epochs: ${[...new Set(mevRugs.map(r => r.epoch))].sort((a,b) => a-b).join(', ')}`)
    
    // Group by epoch FIRST, track commission vs MEV separately
    interface EpochData {
      commissionValidators: Set<string>
      mevValidators: Set<string>
      allValidators: Set<string>
      commissionEvents: number
      mevEvents: number
    }
    
    const rugsByEpoch = new Map<number, EpochData>()
    
    // Process commission rugs
    for (const rug of commissionRugs) {
      const epoch = Number(rug.epoch)
      const votePubkey = String(rug.vote_pubkey)
      
      if (!rugsByEpoch.has(epoch)) {
        rugsByEpoch.set(epoch, { 
          commissionValidators: new Set(), 
          mevValidators: new Set(),
          allValidators: new Set(),
          commissionEvents: 0,
          mevEvents: 0
        })
      }
      const epochData = rugsByEpoch.get(epoch)!
      epochData.commissionValidators.add(votePubkey)
      epochData.allValidators.add(votePubkey)
      epochData.commissionEvents++
    }
    
    // Process MEV rugs
    for (const rug of mevRugs) {
      const epoch = Number(rug.epoch)
      const votePubkey = String(rug.vote_pubkey)
      
      if (!rugsByEpoch.has(epoch)) {
        rugsByEpoch.set(epoch, { 
          commissionValidators: new Set(), 
          mevValidators: new Set(),
          allValidators: new Set(),
          commissionEvents: 0,
          mevEvents: 0
        })
      }
      const epochData = rugsByEpoch.get(epoch)!
      epochData.mevValidators.add(votePubkey)
      epochData.allValidators.add(votePubkey)
      epochData.mevEvents++
    }

    // Convert to array with breakdown by type
    const data = Array.from(rugsByEpoch.entries())
      .map(([epoch, { commissionValidators, mevValidators, allValidators, commissionEvents, mevEvents }]) => ({ 
        epoch,
        uniqueValidators: allValidators.size,  // Total unique validators (some may have both types)
        commissionValidators: commissionValidators.size,
        mevValidators: mevValidators.size,
        totalEvents: commissionEvents + mevEvents,
        commissionEvents,
        mevEvents,
        // Validators who rugged BOTH commission and MEV in this epoch
        bothTypes: Array.from(commissionValidators).filter(v => mevValidators.has(v)).length
      }))
      .sort((a, b) => a.epoch - b.epoch)

    // Count total UNIQUE validators across all epochs (for this page)
    const allUniqueValidators = new Set<string>()
    const validatorEpochCount = new Map<string, number>()
    
    for (const epochData of rugsByEpoch.values()) {
      epochData.allValidators.forEach(v => {
        allUniqueValidators.add(v)
        validatorEpochCount.set(v, (validatorEpochCount.get(v) || 0) + 1)
      })
    }

    // Count how many validators rugged in multiple epochs (actual repeat offenders)
    const repeatOffenders = Array.from(validatorEpochCount.values()).filter(count => count > 1).length
    
    // Calculate totals for summary
    const totalCommissionEvents = data.reduce((sum, d) => sum + d.commissionEvents, 0)
    const totalMevEvents = data.reduce((sum, d) => sum + d.mevEvents, 0)

    // GLOBAL STATS (all time, not just this page)
    // Get the earliest epoch with rugs
    const earliestCommissionEpoch = await sql`SELECT MIN(epoch) as epoch FROM events WHERE type = 'RUG'`
    const earliestMevEpoch = await sql`SELECT MIN(epoch) as epoch FROM mev_events WHERE type = 'RUG'`
    const earliestEpoch = Math.min(
      earliestCommissionEpoch[0]?.epoch || latestEpoch,
      earliestMevEpoch[0]?.epoch || latestEpoch
    )
    const totalEpochsTracked = Number(latestEpoch) - Number(earliestEpoch) + 1
    
    // Get peak rugs in any single epoch (all time) by querying ALL epochs
    const allCommissionRugs = await sql`SELECT epoch, COUNT(DISTINCT vote_pubkey) as count FROM events WHERE type = 'RUG' GROUP BY epoch`
    const allMevRugs = await sql`SELECT epoch, COUNT(DISTINCT vote_pubkey) as count FROM mev_events WHERE type = 'RUG' GROUP BY epoch`
    
    // Combine and find max per epoch
    const rugCountsByEpoch = new Map<number, Set<string>>()
    for (const row of allCommissionRugs) {
      if (!rugCountsByEpoch.has(Number(row.epoch))) rugCountsByEpoch.set(Number(row.epoch), new Set())
    }
    for (const row of allMevRugs) {
      if (!rugCountsByEpoch.has(Number(row.epoch))) rugCountsByEpoch.set(Number(row.epoch), new Set())
    }
    
    // Query all rugs to count unique validators per epoch
    const allCommissionRugsList = await sql`SELECT epoch, vote_pubkey FROM events WHERE type = 'RUG'`
    const allMevRugsList = await sql`SELECT epoch, vote_pubkey FROM mev_events WHERE type = 'RUG'`
    
    for (const rug of allCommissionRugsList) {
      rugCountsByEpoch.get(Number(rug.epoch))?.add(String(rug.vote_pubkey))
    }
    for (const rug of allMevRugsList) {
      rugCountsByEpoch.get(Number(rug.epoch))?.add(String(rug.vote_pubkey))
    }
    
    const peakRugsInAnyEpoch = rugCountsByEpoch.size > 0 ? Math.max(...Array.from(rugCountsByEpoch.values()).map(s => s.size)) : 0
    const totalUniqueRuggedValidators = new Set([...allCommissionRugsList.map(r => String(r.vote_pubkey)), ...allMevRugsList.map(r => String(r.vote_pubkey))]).size
    const avgRugsPerEpoch = totalEpochsTracked > 0 ? (totalUniqueRuggedValidators / totalEpochsTracked) : 0

    console.log(`📊 ${data.length} epochs with ${allUniqueValidators.size} unique rugged validators total`)
    console.log(`📊 ${repeatOffenders} validators rugged in multiple epochs (repeat offenders)`)
    console.log(`📊 ${totalCommissionEvents} commission events, ${totalMevEvents} MEV events`)
    console.log(`📊 GLOBAL: ${totalEpochsTracked} total epochs tracked, peak: ${peakRugsInAnyEpoch}, avg: ${avgRugsPerEpoch.toFixed(1)}`)

    return NextResponse.json({ 
      data,
      meta: {
        totalUniqueValidators: allUniqueValidators.size,
        totalEpochs: data.length,
        repeatOffenders,  // Validators who rugged in 2+ epochs
        includesMevRugs: true,
        totalCommissionEvents,
        totalMevEvents,
        validatorEpochCounts: Object.fromEntries(validatorEpochCount), // Map of validator -> epoch count
        // Global stats (all time)
        globalTotalEpochsTracked: totalEpochsTracked,
        globalPeakRugs: peakRugsInAnyEpoch,
        globalAvgPerEpoch: Number(avgRugsPerEpoch.toFixed(1)),
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      }
    })
  } catch (e: any) {
    console.error('❌ rugs-per-epoch error:', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
