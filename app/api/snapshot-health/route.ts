import { NextResponse } from 'next/server'
import { sql } from '../../../lib/db-neon'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Check when the last snapshot was created
    const lastSnapshot = await sql`
      SELECT epoch, created_at
      FROM snapshots
      ORDER BY created_at DESC
      LIMIT 1
    `
    
    // Check when the last event was created
    const lastEvent = await sql`
      SELECT epoch, created_at, type
      FROM events
      ORDER BY created_at DESC
      LIMIT 1
    `
    
    // Check when the last MEV event was created  
    const lastMevEvent = await sql`
      SELECT epoch, created_at, type
      FROM mev_events
      ORDER BY created_at DESC
      LIMIT 1
    `
    
    // Get current epoch from RPC to compare
    const rpcRes = await fetch(process.env.RPC_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getEpochInfo", params: [] }),
    })
    const rpcJson = await rpcRes.json()
    const currentEpoch = rpcJson.result?.epoch
    
    const now = Date.now()
    const lastSnapshotAge = lastSnapshot[0]?.created_at 
      ? Math.floor((now - new Date(lastSnapshot[0].created_at).getTime()) / 1000 / 60) 
      : null
    
    const lastEventAge = lastEvent[0]?.created_at
      ? Math.floor((now - new Date(lastEvent[0].created_at).getTime()) / 1000 / 60)
      : null
    
    const lastMevEventAge = lastMevEvent[0]?.created_at
      ? Math.floor((now - new Date(lastMevEvent[0].created_at).getTime()) / 1000 / 60)
      : null
    
    // Snapshot job should run every 15 minutes
    const isHealthy = lastSnapshotAge !== null && lastSnapshotAge < 20
    const isStale = lastSnapshotAge !== null && lastSnapshotAge > 30
    
    return NextResponse.json({
      status: isHealthy ? 'healthy' : isStale ? 'stale' : 'unknown',
      currentEpoch,
      lastSnapshot: {
        epoch: lastSnapshot[0]?.epoch || null,
        createdAt: lastSnapshot[0]?.created_at || null,
        minutesAgo: lastSnapshotAge,
      },
      lastEvent: {
        epoch: lastEvent[0]?.epoch || null,
        type: lastEvent[0]?.type || null,
        createdAt: lastEvent[0]?.created_at || null,
        minutesAgo: lastEventAge,
      },
      lastMevEvent: {
        epoch: lastMevEvent[0]?.epoch || null,
        type: lastMevEvent[0]?.type || null,
        createdAt: lastMevEvent[0]?.created_at || null,
        minutesAgo: lastMevEventAge,
      },
      warnings: [
        ...(lastSnapshotAge && lastSnapshotAge > 30 ? ['Snapshot data is stale (>30 minutes old)'] : []),
        ...(lastSnapshot[0]?.epoch < currentEpoch - 1 ? ['Snapshot epoch is behind current epoch'] : []),
      ]
    })
  } catch (err: any) {
    return NextResponse.json({
      status: 'error',
      error: err.message || String(err)
    }, { status: 500 })
  }
}

