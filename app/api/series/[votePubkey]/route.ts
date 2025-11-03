import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db-neon'

export const dynamic = 'force-dynamic'

export async function GET(_: NextRequest, { params }: { params: { votePubkey: string } }) {
  try {
    // We MUST use events table, not snapshots, because:
    // - Snapshots run once per epoch (final state only)
    // - Events capture EVERY change with timestamps (including multiple changes per epoch)
    // - This is critical for validators that oscillate commission within a single epoch
    
    // Fetch inflation commission events
    const inflationEvents = await sql`
      SELECT epoch, from_commission, to_commission, created_at
      FROM events 
      WHERE vote_pubkey = ${params.votePubkey}
      ORDER BY epoch ASC, created_at ASC
    `
    
    // Fetch MEV commission events
    const mevEvents = await sql`
      SELECT epoch, from_mev_commission as from_commission, to_mev_commission as to_commission, created_at
      FROM mev_events 
      WHERE vote_pubkey = ${params.votePubkey}
      ORDER BY epoch ASC, created_at ASC
    `
    
    // If no events exist, get current commission from snapshots to seed the chart
    let initialInflation: number | null = null;
    let initialMev: number | null = null;
    let initialEpoch: number | null = null;
    
    if (inflationEvents.length === 0) {
      const snapshot = await sql`
        SELECT epoch, commission
        FROM snapshots
        WHERE vote_pubkey = ${params.votePubkey} AND commission IS NOT NULL
        ORDER BY epoch DESC
        LIMIT 1
      `;
      if (snapshot[0]) {
        initialInflation = Number(snapshot[0].commission);
        initialEpoch = snapshot[0].epoch;
      }
    }
    
    if (mevEvents.length === 0) {
      const snapshot = await sql`
        SELECT epoch, mev_commission
        FROM mev_snapshots
        WHERE vote_pubkey = ${params.votePubkey} AND mev_commission IS NOT NULL
        ORDER BY epoch DESC
        LIMIT 1
      `;
      if (snapshot[0]) {
        initialMev = Number(snapshot[0].mev_commission);
        if (!initialEpoch || snapshot[0].epoch < initialEpoch) {
          initialEpoch = snapshot[0].epoch;
        }
      }
    }
    
    // Build timeline with ALL data points (before and after each change)
    type Point = { epoch: number; commission: number | null; mevCommission: number | null; time: number };
    const points: Point[] = [];
    
    // Add initial snapshot values if no events exist
    if (initialEpoch !== null && (initialInflation !== null || initialMev !== null)) {
      points.push({
        epoch: initialEpoch,
        commission: initialInflation,
        mevCommission: initialMev,
        time: 0 // Earliest time
      });
    }
    
    // Process inflation events - only add "to" values (the actual changes)
    // The "from" value is implied by the previous point
    inflationEvents.forEach((e, index) => {
      const time = new Date(e.created_at).getTime();
      
      // Only add "from" for the very first event (if no initial snapshot)
      if (index === 0 && initialInflation === null) {
        points.push({
          epoch: e.epoch,
          commission: Number(e.from_commission),
          mevCommission: null,
          time: time - 1
        });
      }
      
      // Always add the "to" value (the change)
      points.push({
        epoch: e.epoch,
        commission: Number(e.to_commission),
        mevCommission: null,
        time: time
      });
    });
    
    // Process MEV events - only add "to" values
    mevEvents.forEach((e, index) => {
      const time = new Date(e.created_at).getTime();
      
      // Only add "from" for the very first event (if no initial snapshot)
      if (index === 0 && initialMev === null) {
        points.push({
          epoch: e.epoch,
          commission: null,
          mevCommission: Number(e.from_commission),
          time: time - 1
        });
      }
      
      // Always add the "to" value (the change)
      points.push({
        epoch: e.epoch,
        commission: null,
        mevCommission: Number(e.to_commission),
        time: time
      });
    });
    
    // Sort by time
    points.sort((a, b) => a.time - b.time);
    
    // Forward-fill: merge points at same time and carry values forward
    let lastInflation: number | null = null;
    let lastMev: number | null = null;
    
    const series = points.map(p => {
      if (p.commission !== null) lastInflation = p.commission;
      if (p.mevCommission !== null) lastMev = p.mevCommission;
      
      return {
        epoch: p.epoch,
        commission: lastInflation,
        mevCommission: lastMev
      };
    });
    
    return NextResponse.json({ series })
  } catch (error: any) {
    console.error('Series error:', error)
    return NextResponse.json({ series: [], error: error.message }, { status: 500 })
  }
}

