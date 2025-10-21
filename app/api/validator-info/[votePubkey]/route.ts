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

    // Get current epoch info from RPC
    const rpcUrl = process.env.RPC_URL!;
    const epochRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getEpochInfo',
        params: [],
      }),
    });
    const epochJson = await epochRes.json();
    const currentEpoch = Number(epochJson.result?.epoch || 0);
    const slotIndex = Number(epochJson.result?.slotIndex || 0);
    const slotsInEpoch = Number(epochJson.result?.slotsInEpoch || 1);

    // Fetch latest performance data
    const perfRecords = await tb.performanceHistory.select({
      filterByFormula: `AND({votePubkey} = "${votePubkey}", {epoch} = ${currentEpoch})`,
      sort: [{ field: 'epoch', direction: 'desc' }],
      maxRecords: 1,
    }).firstPage();

    // Fetch latest stake data
    const stakeRecords = await tb.stakeHistory.select({
      filterByFormula: `AND({votePubkey} = "${votePubkey}", {epoch} = ${currentEpoch})`,
      sort: [{ field: 'epoch', direction: 'desc' }],
      maxRecords: 1,
    }).firstPage();

    // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
    const LAMPORTS_PER_SOL = 1_000_000_000;
    
    const stakeData = stakeRecords[0] ? {
      activeStake: Number(stakeRecords[0].get('activeStake') || 0) / LAMPORTS_PER_SOL,
      activatingStake: Number(stakeRecords[0].get('activatingStake') || 0) / LAMPORTS_PER_SOL,
      deactivatingStake: Number(stakeRecords[0].get('deactivatingStake') || 0) / LAMPORTS_PER_SOL,
      epoch: Number(stakeRecords[0].get('epoch')),
    } : null;

    const perfData = perfRecords[0] ? {
      skipRate: Number(perfRecords[0].get('skipRate') || 0),
      voteCredits: Number(perfRecords[0].get('voteCredits') || 0),
      epoch: Number(perfRecords[0].get('epoch')),
      // Calculate vote credits percentage vs expected
      // Max credits = 16 per slot, so expected = slots elapsed × 16
      voteCreditsPercentage: slotIndex > 0 
        ? (Number(perfRecords[0].get('voteCredits') || 0) / (slotIndex * 16)) * 100 
        : 0,
      slotsElapsed: slotIndex,
      maxPossibleCredits: slotIndex * 16,
    } : null;

    return NextResponse.json({
      validator: {
        votePubkey: validator.get('votePubkey'),
        identityPubkey: validator.get('identityPubkey'),
        name: validator.get('name'),
        iconUrl: validator.get('iconUrl'),
        website: validator.get('website'),
        version: validator.get('version'),
      },
      performance: perfData,
      stake: stakeData,
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

