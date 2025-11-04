import { NextResponse } from 'next/server'
import { sql } from '../../../lib/db-neon'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Check the last snapshot job run
    const lastJobRun = await sql`
      SELECT id, status, started_at, completed_at, epoch, duration_seconds, metrics, error_message
      FROM job_runs
      WHERE job_name = 'snapshot'
      ORDER BY started_at DESC
      LIMIT 1
    `
    
    // Check when the last snapshot was created (for data freshness)
    const lastSnapshot = await sql`
      SELECT epoch, created_at
      FROM snapshots
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
    
    // Calculate age of last job run
    const lastJobRunAge = lastJobRun[0]?.completed_at
      ? Math.floor((now - new Date(lastJobRun[0].completed_at).getTime()) / 1000 / 60)
      : lastJobRun[0]?.started_at
      ? Math.floor((now - new Date(lastJobRun[0].started_at).getTime()) / 1000 / 60)
      : null
    
    // Snapshot job runs every 15 minutes
    // Healthy: last run <20 minutes ago AND status = success
    // Stale: last run >30 minutes ago OR last status = failed
    const lastJobStatus = lastJobRun[0]?.status
    const isHealthy = lastJobRunAge !== null && lastJobRunAge < 20 && lastJobStatus === 'success'
    const isStale = lastJobRunAge === null || lastJobRunAge > 30 || lastJobStatus === 'failed'
    
    return NextResponse.json({
      status: isHealthy ? 'healthy' : isStale ? 'stale' : 'unknown',
      currentEpoch,
      lastJobRun: {
        id: lastJobRun[0]?.id || null,
        status: lastJobStatus || null,
        startedAt: lastJobRun[0]?.started_at || null,
        completedAt: lastJobRun[0]?.completed_at || null,
        epoch: lastJobRun[0]?.epoch || null,
        durationSeconds: lastJobRun[0]?.duration_seconds || null,
        minutesAgo: lastJobRunAge,
        metrics: lastJobRun[0]?.metrics || null,
        errorMessage: lastJobRun[0]?.error_message || null,
      },
      lastDataCreated: {
        epoch: lastSnapshot[0]?.epoch || null,
        createdAt: lastSnapshot[0]?.created_at || null,
      },
      warnings: [
        ...(lastJobRunAge === null ? ['No job runs recorded'] : []),
        ...(lastJobRunAge && lastJobRunAge > 30 ? [`Job hasn't run in ${lastJobRunAge} minutes (expected every 15 min)`] : []),
        ...(lastJobStatus === 'failed' ? ['Last job run FAILED - check errorMessage'] : []),
        ...(lastJobStatus === 'running' && lastJobRunAge && lastJobRunAge > 10 ? ['Job has been running for >10 minutes (possible timeout)'] : []),
      ]
    })
  } catch (err: any) {
    return NextResponse.json({
      status: 'error',
      error: err.message || String(err)
    }, { status: 500 })
  }
}

