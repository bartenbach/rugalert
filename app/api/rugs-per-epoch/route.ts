import { sql } from '@/lib/db-neon'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const epochs = Number(new URL(req.url).searchParams.get('epochs') ?? '10')
    
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
    
    const minEpoch = Number(latestEpoch) - epochs
    
    console.log(`📊 Querying rugs: latestEpoch=${latestEpoch}, minEpoch=${minEpoch}, range=${epochs}`)
    
    // Fetch BOTH commission RUGs and MEV RUGs
    const commissionRugs = await sql`
      SELECT vote_pubkey, epoch, type, created_at
      FROM events 
      WHERE type = 'RUG' AND epoch >= ${minEpoch}
      ORDER BY created_at DESC
    `
    
    const mevRugs = await sql`
      SELECT vote_pubkey, epoch, type, created_at
      FROM mev_events 
      WHERE type = 'RUG' AND epoch >= ${minEpoch}
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

    // Count total UNIQUE validators across all epochs
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

    console.log(`📊 ${data.length} epochs with ${allUniqueValidators.size} unique rugged validators total`)
    console.log(`📊 ${repeatOffenders} validators rugged in multiple epochs (repeat offenders)`)
    console.log(`📊 ${totalCommissionEvents} commission events, ${totalMevEvents} MEV events`)

    return NextResponse.json({ 
      data,
      meta: {
        totalUniqueValidators: allUniqueValidators.size,
        totalEpochs: data.length,
        repeatOffenders,  // Validators who rugged in 2+ epochs
        includesMevRugs: true,
        totalCommissionEvents,
        totalMevEvents,
        validatorEpochCounts: Object.fromEntries(validatorEpochCount) // Map of validator -> epoch count
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
