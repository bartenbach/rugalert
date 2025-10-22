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

    console.log(`📊 Found ${stakeRecords.length} stake history records for ${votePubkey}`);
    
    // Convert lamports to SOL
    const LAMPORTS_PER_SOL = 1_000_000_000;
    
    const history = stakeRecords.map(r => {
      const activeStake = Number(r.get('activeStake') || 0) / LAMPORTS_PER_SOL;
      const activatingStake = Number(r.get('activatingStake') || 0) / LAMPORTS_PER_SOL;
      const deactivatingStake = Number(r.get('deactivatingStake') || 0) / LAMPORTS_PER_SOL;
      
      // Debug first record
      if (stakeRecords.indexOf(r) === 0) {
        console.log(`📊 First record - Epoch: ${r.get('epoch')}, Raw activeStake: ${r.get('activeStake')}, Converted: ${activeStake}`);
      }
      
      return {
        epoch: Number(r.get('epoch')),
        activeStake,
        activatingStake,
        deactivatingStake,
      };
    });

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

