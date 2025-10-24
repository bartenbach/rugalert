import { NextRequest, NextResponse } from 'next/server';
import { tb } from '../../../../lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { votePubkey: string } }
) {
  try {
    const { votePubkey } = params;

    // Fetch validator info
    const validatorRecords = await tb.validators.select({
      filterByFormula: `{votePubkey} = "${votePubkey}"`,
      maxRecords: 1,
    }).firstPage();

    if (!validatorRecords[0]) {
      return NextResponse.json(
        { error: 'Validator not found' },
        { status: 404 }
      );
    }

    const validator = validatorRecords[0];

    // Get current epoch info and vote accounts from RPC
    const rpcUrl = process.env.RPC_URL!;
    const [epochRes, voteAccountsRes] = await Promise.all([
      fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getEpochInfo',
          params: [],
        }),
      }),
      fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'getVoteAccounts',
          params: [],
        }),
      }),
    ]);
    
    const epochJson = await epochRes.json();
    const voteAccountsJson = await voteAccountsRes.json();
    
    const currentEpoch = Number(epochJson.result?.epoch || 0);
    const slotIndex = Number(epochJson.result?.slotIndex || 0);
    const slotsInEpoch = Number(epochJson.result?.slotsInEpoch || 1);
    
    // Check if validator is delinquent (real-time from RPC)
    const isDelinquent = voteAccountsJson.result?.delinquent?.some(
      (v: any) => v.votePubkey === votePubkey
    ) || false;

    // Fetch latest performance data (most recent epoch)
    const perfRecords = await tb.performanceHistory.select({
      filterByFormula: `{votePubkey} = "${votePubkey}"`,
      sort: [{ field: 'epoch', direction: 'desc' }],
      maxRecords: 1,
    }).firstPage();

    // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
    const LAMPORTS_PER_SOL = 1_000_000_000;
    
    // Get stake data from validator record (cached by snapshot job)
    const activatingAccountsJson = validator.get('activatingAccounts');
    const deactivatingAccountsJson = validator.get('deactivatingAccounts');
    
    const stakeData = {
      activeStake: Number(validator.get('activeStake') || 0) / LAMPORTS_PER_SOL,
      activatingStake: Number(validator.get('activatingStake') || 0) / LAMPORTS_PER_SOL,
      deactivatingStake: Number(validator.get('deactivatingStake') || 0) / LAMPORTS_PER_SOL,
      activatingAccounts: activatingAccountsJson ? JSON.parse(activatingAccountsJson as string) : [],
      deactivatingAccounts: deactivatingAccountsJson ? JSON.parse(deactivatingAccountsJson as string) : [],
      epoch: currentEpoch,
    };

    const perfData = perfRecords[0] ? {
      skipRate: Number(perfRecords[0].get('skipRate') || 0),
      leaderSlots: Number(perfRecords[0].get('leaderSlots') || 0),
      blocksProduced: Number(perfRecords[0].get('blocksProduced') || 0),
      voteCredits: Number(perfRecords[0].get('voteCredits') || 0),
      epoch: Number(perfRecords[0].get('epoch')),
      // Use the pre-calculated percentage from snapshot job (relative to best performer)
      voteCreditsPercentage: Number(perfRecords[0].get('voteCreditsPercentage') || 0),
      maxPossibleCredits: Number(perfRecords[0].get('maxPossibleCredits') || 0),
    } : null;

    // Debug logging for vote credits
    if (perfData) {
      console.log(`📊 ${votePubkey.substring(0, 8)}... - Epoch ${perfData.epoch}: voteCredits=${perfData.voteCredits}, percentage=${perfData.voteCreditsPercentage}%, max=${perfData.maxPossibleCredits}`);
    } else {
      console.log(`⚠️  ${votePubkey.substring(0, 8)}... - No performance data found in database`);
    }

    // Fetch latest MEV data if validator is Jito-enabled
    const jitoEnabled = Boolean(validator.get('jitoEnabled'));
    let mevData = null;
    
    if (jitoEnabled) {
      const mevRecords = await tb.mevSnapshots.select({
        filterByFormula: `{votePubkey} = "${votePubkey}"`,
        sort: [{ field: 'epoch', direction: 'desc' }],
        maxRecords: 1,
      }).firstPage();

      if (mevRecords[0]) {
        mevData = {
          mevCommission: Number(mevRecords[0].get('mevCommission') || 0),
          priorityFeeCommission: Number(mevRecords[0].get('priorityFeeCommission') || 0),
          epoch: Number(mevRecords[0].get('epoch')),
        };
      }
    }

    return NextResponse.json({
      validator: {
        votePubkey: validator.get('votePubkey'),
        identityPubkey: validator.get('identityPubkey'),
        name: validator.get('name'),
        iconUrl: validator.get('iconUrl'),
        website: validator.get('website'),
        version: validator.get('version'),
        delinquent: isDelinquent, // Use real-time RPC data
        jitoEnabled,
      },
      performance: perfData,
      stake: stakeData,
      mev: mevData,
      currentEpoch,
    });
  } catch (error: any) {
    console.error('❌ validator-info error:', error);
    return NextResponse.json(
      { error: String(error?.message || error) },
      { status: 500 }
    );
  }
}

