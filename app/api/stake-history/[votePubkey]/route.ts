import { NextRequest, NextResponse } from 'next/server';
import { tb } from '../../../../lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { votePubkey: string } }
) {
  try {
    const { votePubkey } = params;

    // Fetch stake history records
    const stakeRecords: any[] = [];
    await tb.stakeHistory.select({
      filterByFormula: `{votePubkey} = "${votePubkey}"`,
      sort: [{ field: 'epoch', direction: 'asc' }],
      pageSize: 100,
    }).eachPage((records, fetchNextPage) => {
      stakeRecords.push(...records);
      fetchNextPage();
    });

    // Convert lamports to SOL
    const LAMPORTS_PER_SOL = 1_000_000_000;
    
    // Note: activatingStake and deactivatingStake are NOT in stake_history
    // They are cached in the validators table as current ephemeral state
    const history = stakeRecords.map(r => ({
      epoch: Number(r.get('epoch')),
      activeStake: Number(r.get('activeStake') || 0) / LAMPORTS_PER_SOL,
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

