import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db-neon'

export const dynamic = 'force-dynamic'

export async function GET(_: NextRequest, { params }: { params: { votePubkey: string } }) {
  try {
    // Fetch inflation commission history from EVENTS (not snapshots) to show all changes
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
    
    // Combine events into a single timeline
    // Create array of all data points with timestamps
    type DataPoint = {
      epoch: number;
      commission: number | null;
      mevCommission: number | null;
      timestamp: Date;
    };
    
    const allPoints: DataPoint[] = [];
    
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
    
    // Build series by tracking current commission values
    let currentInflationCommission: number | null = null;
    let currentMevCommission: number | null = null;
    
    const series: Array<{ epoch: number; commission: number | null; mevCommission: number | null }> = [];
    
    allPoints.forEach(point => {
      // Update current values
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
