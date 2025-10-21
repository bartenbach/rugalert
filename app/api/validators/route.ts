import { Connection, clusterApiUrl } from "@solana/web3.js";
import Airtable from "airtable";
import { NextRequest, NextResponse } from "next/server";

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY,
}).base(process.env.AIRTABLE_BASE_ID!);

const VALIDATORS_TABLE = "validators";
const STAKE_HISTORY_TABLE = "stake_history";
const SNAPSHOTS_TABLE = "snapshots";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "0");
    const pageSize = parseInt(searchParams.get("pageSize") || "0");

    // Get current epoch and vote accounts for total stake
    const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");
    const connection = new Connection(rpcUrl);
    const [epochInfo, voteAccounts] = await Promise.all([
      connection.getEpochInfo(),
      connection.getVoteAccounts(),
    ]);
    const currentEpoch = epochInfo.epoch;
    
    // Calculate real-time network totals from RPC
    const totalActiveStake = voteAccounts.current.reduce(
      (sum, v) => sum + v.activatedStake,
      0
    );
    const totalDelinquentStake = voteAccounts.delinquent.reduce(
      (sum, v) => sum + v.activatedStake,
      0
    );
    const networkTotalStake = totalActiveStake + totalDelinquentStake;
    
    // Build maps for RPC stake data and delinquent status
    const rpcStakeMap = new Map<string, number>();
    const delinquentSet = new Set<string>();
    
    voteAccounts.current.forEach((v: any) => {
      rpcStakeMap.set(v.votePubkey, v.activatedStake);
    });
    
    voteAccounts.delinquent.forEach((v: any) => {
      rpcStakeMap.set(v.votePubkey, v.activatedStake);
      delinquentSet.add(v.votePubkey);
    });

    // Fetch all validators (only the fields we need)
    const validatorsMap = new Map<string, any>();
    await base(VALIDATORS_TABLE)
      .select({
        fields: ['votePubkey', 'identityPubkey', 'name', 'iconUrl', 'version'],
        pageSize: 100,
      })
      .eachPage((pageRecords, fetchNextPage) => {
        pageRecords.forEach((record) => {
          validatorsMap.set(record.fields.votePubkey as string, {
            id: record.id,
            votePubkey: record.fields.votePubkey,
            identityPubkey: record.fields.identityPubkey,
            name: record.fields.name || null,
            iconUrl: record.fields.iconUrl || null,
            version: record.fields.version || null,
            commission: 0, // Will be filled from snapshots
            // Delinquent status will be set from real-time RPC data below
          });
        });
        fetchNextPage();
      });

    // Fetch latest commission from snapshots
    // Sorted by epoch desc to get most recent first
    const commissionMap = new Map<string, { commission: number; epoch: number }>();
    await base(SNAPSHOTS_TABLE)
      .select({
        fields: ['votePubkey', 'commission', 'epoch'],
        pageSize: 100,
        sort: [{ field: 'epoch', direction: 'desc' }],
        maxRecords: 2000, // Limit to recent records for performance
      })
      .eachPage((pageRecords, fetchNextPage) => {
        pageRecords.forEach((record) => {
          const votePubkey = record.fields.votePubkey as string;
          const commission = Number(record.fields.commission || 0);
          const epoch = Number(record.fields.epoch || 0);
          
          // Keep only the most recent snapshot for each validator (first occurrence since sorted desc)
          if (!commissionMap.has(votePubkey)) {
            commissionMap.set(votePubkey, { commission, epoch });
          }
        });
        fetchNextPage();
      });

    // Fetch latest stake data for current epoch
    const stakeHistoryMap = new Map<string, any>();
    await base(STAKE_HISTORY_TABLE)
      .select({
        fields: ['votePubkey', 'activeStake', 'activatingStake', 'deactivatingStake', 'epoch'],
        filterByFormula: `{epoch} = ${currentEpoch}`,
        pageSize: 100,
      })
      .eachPage((pageRecords, fetchNextPage) => {
        pageRecords.forEach((record) => {
          stakeHistoryMap.set(record.fields.votePubkey as string, record);
        });
        fetchNextPage();
      });

    // Merge ALL validators with their stake and commission data
    // Use stake_history if available, otherwise fall back to RPC stake data
    const validatorsWithStake: any[] = [];
    const processedVotePubkeys = new Set<string>();
    
    // First, process validators from our database
    validatorsMap.forEach((validator, votePubkey) => {
      processedVotePubkeys.add(votePubkey);
      const stakeRecord = stakeHistoryMap.get(votePubkey);
      const commissionData = commissionMap.get(votePubkey);
      const rpcStake = rpcStakeMap.get(votePubkey) || 0;
      
      // Use stake_history if available, otherwise use RPC data
      const activeStake = stakeRecord 
        ? Number(stakeRecord.fields.activeStake || 0)
        : rpcStake;
      
      // Only include validators with stake > 0
      if (activeStake > 0) {
        validatorsWithStake.push({
          ...validator,
          commission: commissionData?.commission || 0,
          activeStake,
          activatingStake: stakeRecord ? Number(stakeRecord.fields.activatingStake || 0) : 0,
          deactivatingStake: stakeRecord ? Number(stakeRecord.fields.deactivatingStake || 0) : 0,
          // Override delinquent status with real-time RPC data
          delinquent: delinquentSet.has(votePubkey),
        });
      }
    });
    
    // Then, add any validators from RPC that aren't in our database yet
    // (This catches delinquent validators that haven't been processed)
    rpcStakeMap.forEach((rpcStake, votePubkey) => {
      if (!processedVotePubkeys.has(votePubkey) && rpcStake > 0) {
        const commissionData = commissionMap.get(votePubkey);
        validatorsWithStake.push({
          votePubkey,
          identityPubkey: null,
          name: null,
          iconUrl: null,
          version: null,
          commission: commissionData?.commission || 0,
          activeStake: rpcStake,
          activatingStake: 0,
          deactivatingStake: 0,
          delinquent: delinquentSet.has(votePubkey),
        });
      }
    });

    // Sort by activeStake descending
    validatorsWithStake.sort((a, b) => b.activeStake - a.activeStake);

    // Calculate total stake and cumulative percentages
    const totalStake = validatorsWithStake.reduce(
      (sum, v) => sum + v.activeStake,
      0
    );

    let cumulativeStake = 0;
    const allValidators = validatorsWithStake.map((validator, index) => {
      cumulativeStake += validator.activeStake;

      return {
        votePubkey: validator.votePubkey,
        identityPubkey: validator.identityPubkey,
        name: validator.name,
        iconUrl: validator.iconUrl,
        commission: validator.commission,
        activeStake: validator.activeStake / 1e9, // Convert to SOL
        activatingStake: validator.activatingStake / 1e9,
        deactivatingStake: validator.deactivatingStake / 1e9,
        stakePercent: totalStake > 0 ? (validator.activeStake / totalStake) * 100 : 0,
        cumulativeStakePercent: totalStake > 0 ? (cumulativeStake / totalStake) * 100 : 0,
        version: validator.version,
        delinquent: validator.delinquent,
        rank: index + 1,
      };
    });

    // Paginate on our side (if page/pageSize are provided)
    let validators = allValidators;
    let hasMore = false;
    
    if (page > 0 && pageSize > 0) {
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      validators = allValidators.slice(startIndex, endIndex);
      hasMore = endIndex < allValidators.length;
    }

    return NextResponse.json({
      validators,
      page,
      pageSize,
      hasMore,
      total: allValidators.length,
      networkStats: {
        totalValidators: voteAccounts.current.length + voteAccounts.delinquent.length,
        activeValidators: voteAccounts.current.length,
        delinquentValidators: voteAccounts.delinquent.length,
        totalStake: networkTotalStake / 1e9, // Convert to SOL
        activeStake: totalActiveStake / 1e9,
        delinquentStake: totalDelinquentStake / 1e9,
      },
    });
  } catch (error: any) {
    console.error("Failed to fetch validators:", error);
    return NextResponse.json(
      { error: "Failed to fetch validators", details: error.message },
      { status: 500 }
    );
  }
}
