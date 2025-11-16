import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db-neon';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { votePubkey: string } }
) {
  try {
    const { votePubkey } = params;

    // Fetch validator info from postgres
    const validatorRecords = await sql`
      SELECT * FROM validators 
      WHERE vote_pubkey = ${votePubkey}
      LIMIT 1
    `;

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
        cache: 'no-store',
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
        cache: 'no-store',
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
    
    // Get real-time commission from RPC vote accounts
    const allVoteAccounts = [
      ...(voteAccountsJson.result?.current || []),
      ...(voteAccountsJson.result?.delinquent || [])
    ];
    const rpcVoteAccount = allVoteAccounts.find((v: any) => v.votePubkey === votePubkey);
    const rpcCommission = rpcVoteAccount?.commission ?? null;

    // Fetch performance data for CURRENT epoch (not most recent completed)
    const perfRecords = await sql`
      SELECT * FROM performance_history
      WHERE vote_pubkey = ${votePubkey} AND epoch = ${currentEpoch}
      LIMIT 1
    `;

    // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
    const LAMPORTS_PER_SOL = 1_000_000_000;
    
    // Parse JSONB fields (postgres stores them as objects already)
    const parseJsonField = (field: any) => {
      if (!field) return [];
      if (Array.isArray(field)) return field;
      if (typeof field === 'string') {
        try {
          return JSON.parse(field);
        } catch {
          return [];
        }
      }
      return [];
    };
    
    // Get stake data from validator record (cached by snapshot job)
    const stakeData = {
      activeStake: Number(validator.active_stake || 0) / LAMPORTS_PER_SOL,
      activatingStake: Number(validator.activating_stake || 0) / LAMPORTS_PER_SOL,
      deactivatingStake: Number(validator.deactivating_stake || 0) / LAMPORTS_PER_SOL,
      activatingAccounts: parseJsonField(validator.activating_accounts),
      deactivatingAccounts: parseJsonField(validator.deactivating_accounts),
      stakeDistribution: parseJsonField(validator.stake_distribution),
      epoch: currentEpoch,
    };

    const perfData = perfRecords[0] ? {
      skipRate: Number(perfRecords[0].skip_rate || 0),
      leaderSlots: Number(perfRecords[0].leader_slots || 0),
      blocksProduced: Number(perfRecords[0].blocks_produced || 0),
      voteCredits: Number(perfRecords[0].vote_credits || 0),
      epoch: Number(perfRecords[0].epoch),
      // Use the pre-calculated percentage from snapshot job (relative to best performer)
      voteCreditsPercentage: Number(perfRecords[0].vote_credits_percentage || 0),
      maxPossibleCredits: Number(perfRecords[0].max_possible_credits || 0),
    } : null;

    // Debug logging for vote credits
    if (perfData) {
      console.log(`📊 ${votePubkey.substring(0, 8)}... - Epoch ${perfData.epoch}: voteCredits=${perfData.voteCredits}, percentage=${perfData.voteCreditsPercentage}%, max=${perfData.maxPossibleCredits}`);
    } else {
      console.log(`⚠️  ${votePubkey.substring(0, 8)}... - No performance data found in database`);
    }

    // Fetch latest MEV data if validator is Jito-enabled
    const jitoEnabled = Boolean(validator.jito_enabled);
    let mevData = null;
    
    if (jitoEnabled) {
      const mevRecords = await sql`
        SELECT * FROM mev_snapshots
        WHERE vote_pubkey = ${votePubkey}
        ORDER BY epoch DESC
        LIMIT 1
      `;

      if (mevRecords[0]) {
        mevData = {
          mevCommission: Number(mevRecords[0].mev_commission || 0),
          priorityFeeCommission: Number(mevRecords[0].priority_fee_commission || 0),
          epoch: Number(mevRecords[0].epoch),
        };
      }
    }

    // Use real-time RPC commission if database has NULL, otherwise use database value
    const finalCommission = validator.commission !== null && validator.commission !== undefined
      ? Number(validator.commission)
      : (rpcCommission !== null ? Number(rpcCommission) : null);

    // Get BAM status from database (set by snapshot job)
    // Fallback to description check if column doesn't exist yet (for backward compatibility)
    const isBamEnabled = validator.bam_enabled !== undefined && validator.bam_enabled !== null
      ? Boolean(validator.bam_enabled)
      : (validator.description 
          ? (validator.description.toLowerCase().includes('bam') || validator.description.toLowerCase().includes('block auction'))
          : false);

    const response = NextResponse.json({
      validator: {
        votePubkey: validator.vote_pubkey,
        identityPubkey: validator.identity_pubkey,
        name: validator.name,
        iconUrl: validator.icon_url,
        website: validator.website,
        description: validator.description,
        version: validator.version,
        commission: finalCommission,
        delinquent: isDelinquent, // Use real-time RPC data
        jitoEnabled,
        bamEnabled: isBamEnabled,
        firstSeenEpoch: Number(validator.first_seen_epoch || 0),
        stakeAccountCount: Number(validator.stake_account_count || 0),
      },
      performance: perfData,
      stake: stakeData,
      mev: mevData,
      currentEpoch,
    });
    
    // Aggressive cache busting
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    response.headers.set('CDN-Cache-Control', 'no-store');
    response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
    
    return response;
  } catch (error: any) {
    console.error('❌ validator-info error:', error);
    return NextResponse.json(
      { error: String(error?.message || error) },
      { status: 500 }
    );
  }
}

