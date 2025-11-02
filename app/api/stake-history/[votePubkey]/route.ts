import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db-neon';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { votePubkey: string } }
) {
  try {
    const { votePubkey } = params;

    // Fetch stake history records from postgres
    const stakeRecords = await sql`
      SELECT epoch, active_stake
      FROM stake_history
      WHERE vote_pubkey = ${votePubkey}
      ORDER BY epoch ASC
    `;

    // Convert lamports to SOL
    const LAMPORTS_PER_SOL = 1_000_000_000;
    
    // Note: activatingStake and deactivatingStake are NOT in stake_history
    // They are cached in the validators table as current ephemeral state
    const history = stakeRecords.map(r => ({
      epoch: Number(r.epoch),
      activeStake: Number(r.active_stake || 0) / LAMPORTS_PER_SOL,
    }));

    return NextResponse.json({
      history,
      total: history.length,
    });
  } catch (error: any) {
    console.error('❌ stake-history error:', error);
    return NextResponse.json(
      { error: String(error?.message || error) },
      { status: 500 }
    );
  }
}

