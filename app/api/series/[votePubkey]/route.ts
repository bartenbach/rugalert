import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db-neon'

export const dynamic = 'force-dynamic'

export async function GET(_: NextRequest, { params }: { params: { votePubkey: string } }) {
  try {
    // Get initial commission from earliest snapshot (for validators with no commission changes)
    const initialSnapshot = await sql`
      SELECT epoch, commission
      FROM snapshots
      WHERE vote_pubkey = ${params.votePubkey}
        AND commission IS NOT NULL
      ORDER BY epoch ASC
      LIMIT 1
    `
    
    // Get initial MEV commission from earliest MEV snapshot
    const initialMevSnapshot = await sql`
      SELECT epoch, mev_commission
      FROM mev_snapshots
      WHERE vote_pubkey = ${params.votePubkey}
        AND mev_commission IS NOT NULL
      ORDER BY epoch ASC
      LIMIT 1
    `
    
    // Fetch inflation commission history from EVENTS to show all changes
    const inflationEvents = await sql`
      SELECT epoch, to_commission as commission, created_at
      FROM events 
      WHERE vote_pubkey = ${params.votePubkey}
      ORDER BY epoch ASC, created_at ASC
    `
    
    // Fetch MEV commission history from MEV EVENTS to show all changes
    const mevEvents = await sql`
      SELECT epoch, to_mev_commission as mev_commission, created_at
      FROM mev_events 
      WHERE vote_pubkey = ${params.votePubkey}
      ORDER BY epoch ASC, created_at ASC
    `
    
    // Initialize starting commission values from snapshots
    let currentInflationCommission: number | null = initialSnapshot[0]?.commission ?? null;
    let currentMevCommission: number | null = initialMevSnapshot[0]?.mev_commission ?? null;
    
    // Combine events into a single timeline
    type DataPoint = {
      epoch: number;
      commission: number | null;
      mevCommission: number | null;
      timestamp: Date;
    };
    
    const allPoints: DataPoint[] = [];
    
    // Add initial snapshot as starting point if we have it and it's before first event
    const firstEventEpoch = Math.min(
      inflationEvents[0]?.epoch ?? Infinity,
      mevEvents[0]?.epoch ?? Infinity
    );
    
    if (initialSnapshot[0] && initialSnapshot[0].epoch < firstEventEpoch) {
      allPoints.push({
        epoch: initialSnapshot[0].epoch,
        commission: initialSnapshot[0].commission,
        mevCommission: null,
        timestamp: new Date(0) // Use old timestamp so it sorts first
      });
    }
    
    if (initialMevSnapshot[0] && initialMevSnapshot[0].epoch < firstEventEpoch) {
      allPoints.push({
        epoch: initialMevSnapshot[0].epoch,
        commission: null,
        mevCommission: initialMevSnapshot[0].mev_commission,
        timestamp: new Date(0)
      });
    }
    
    // Add inflation commission events
    inflationEvents.forEach(e => {
      allPoints.push({
        epoch: e.epoch,
        commission: e.commission,
        mevCommission: null,
        timestamp: new Date(e.created_at)
      });
    });
    
    // Add MEV commission events
    mevEvents.forEach(e => {
      allPoints.push({
        epoch: e.epoch,
        commission: null,
        mevCommission: e.mev_commission,
        timestamp: new Date(e.created_at)
      });
    });
    
    // Sort by epoch then timestamp
    allPoints.sort((a, b) => {
      if (a.epoch !== b.epoch) return a.epoch - b.epoch;
      return a.timestamp.getTime() - b.timestamp.getTime();
    });
    
    // Build series by tracking current commission values (already initialized from snapshots)
    const series: Array<{ epoch: number; commission: number | null; mevCommission: number | null }> = [];
    
    allPoints.forEach(point => {
      // Update current values when we encounter a change
      if (point.commission !== null) {
        currentInflationCommission = point.commission;
      }
      if (point.mevCommission !== null) {
        currentMevCommission = point.mevCommission;
      }
      
      // Add point to series with current state
      series.push({
        epoch: point.epoch,
        commission: currentInflationCommission,
        mevCommission: currentMevCommission
      });
    });
    
    return NextResponse.json({ series })
  } catch (error: any) {
    console.error('Series error:', error)
    return NextResponse.json({ series: [], error: error.message }, { status: 500 })
  }
}
