import { Connection, clusterApiUrl } from "@solana/web3.js";
import Airtable from "airtable";
import { NextRequest, NextResponse } from "next/server";

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY,
}).base(process.env.AIRTABLE_BASE_ID!);

const VALIDATORS_TABLE = "validators";
const MEV_SNAPSHOTS_TABLE = "mev_snapshots";
const DAILY_UPTIME_TABLE = "daily_uptime";

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
        fields: ['votePubkey', 'identityPubkey', 'name', 'iconUrl', 'version', 'commission', 'stakeAccountCount', 'jitoEnabled', 'activeStake', 'activatingStake', 'deactivatingStake'],
        pageSize: 100,
      })
      .eachPage((pageRecords, fetchNextPage) => {
        pageRecords.forEach((record) => {
          const votePubkey = record.fields.votePubkey as string;
          const jitoEnabled = Boolean(record.fields.jitoEnabled);
          
          validatorsMap.set(votePubkey, {
            id: record.id,
            votePubkey,
            identityPubkey: record.fields.identityPubkey,
            name: record.fields.name || null,
            iconUrl: record.fields.iconUrl || null,
            version: record.fields.version || null,
            stakeAccountCount: Number(record.fields.stakeAccountCount || 0),
            commission: Number(record.fields.commission || 0),
            jitoEnabled,
            activeStake: Number(record.fields.activeStake || 0),
            activatingStake: Number(record.fields.activatingStake || 0),
            deactivatingStake: Number(record.fields.deactivatingStake || 0),
            // Delinquent status will be set from real-time RPC data below
          });
        });
        fetchNextPage();
      });

    // Fetch latest MEV commission from mev_snapshots
    // Fetch ALL mev snapshots, group by votePubkey, keep only most recent
    const mevCommissionMap = new Map<string, number>();
    
    await base(MEV_SNAPSHOTS_TABLE)
      .select({
        fields: ['votePubkey', 'mevCommission', 'epoch'],
        pageSize: 100,
      })
      .eachPage((pageRecords, fetchNextPage) => {
        pageRecords.forEach((record) => {
          const votePubkey = record.fields.votePubkey as string;
          const mevCommission = Number(record.fields.mevCommission || 0);
          
          // Keep only the most recent MEV snapshot for each validator
          const existing = mevCommissionMap.get(votePubkey);
          if (existing === undefined) {
            mevCommissionMap.set(votePubkey, mevCommission);
          }
        });
        fetchNextPage();
      });

    // Fetch uptime data from daily_uptime table
    // Aggregate by validator to get overall uptime percentage
    const uptimeMap = new Map<string, { totalChecks: number; delinquentChecks: number; days: number }>();
    
    await base(DAILY_UPTIME_TABLE)
      .select({
        fields: ['votePubkey', 'uptimeChecks', 'delinquentChecks'],
        pageSize: 100,
      })
      .eachPage((pageRecords, fetchNextPage) => {
        pageRecords.forEach((record) => {
          const votePubkey = record.fields.votePubkey as string;
          const uptimeChecks = Number(record.fields.uptimeChecks || 0);
          const delinquentChecks = Number(record.fields.delinquentChecks || 0);
          
          // Aggregate uptime data per validator
          const existing = uptimeMap.get(votePubkey);
          if (existing) {
            existing.totalChecks += uptimeChecks;
            existing.delinquentChecks += delinquentChecks;
            existing.days += 1;
          } else {
            uptimeMap.set(votePubkey, {
              totalChecks: uptimeChecks,
              delinquentChecks: delinquentChecks,
              days: 1,
            });
          }
        });
        fetchNextPage();
      });

    // Note: Stake (including activating/deactivating) is cached in the validators table
    // for performance. No need to join with stake_history for current values.

    // Merge ALL validators with their commission data
    const validatorsWithStake: any[] = [];
    const processedVotePubkeys = new Set<string>();
    
    // First, process validators from our database
    validatorsMap.forEach((validator, votePubkey) => {
      processedVotePubkeys.add(votePubkey);
      const rpcStake = rpcStakeMap.get(votePubkey) || 0;
      
      // Use cached activeStake from validator record, fallback to RPC
      const activeStake = Number(validator.activeStake || rpcStake);
      
      // Only include validators with stake > 0
      if (activeStake > 0) {
        // Calculate uptime percentage from aggregated data
        const uptimeData = uptimeMap.get(votePubkey);
        let uptimePercent: number | null = null;
        let uptimeDays: number | null = null;
        
        if (uptimeData && uptimeData.totalChecks > 0) {
          const upChecks = uptimeData.totalChecks - uptimeData.delinquentChecks;
          uptimePercent = (upChecks / uptimeData.totalChecks) * 100;
          uptimeDays = uptimeData.days;
        }
        
        validatorsWithStake.push({
          ...validator,
          // commission is already in validator object (cached by snapshot job)
          commission: Number(validator.commission || 0),
          activeStake,
          // activatingStake and deactivatingStake are already in validator object (cached by snapshot job)
          activatingStake: Number(validator.activatingStake || 0),
          deactivatingStake: Number(validator.deactivatingStake || 0),
          // Override delinquent status with real-time RPC data
          delinquent: delinquentSet.has(votePubkey),
          // stakeAccountCount comes from validator object (cached in DB)
          // MEV commission from mev_snapshots
          mevCommission: mevCommissionMap.get(votePubkey) ?? null,
          // Uptime data from daily_uptime table
          uptimePercent,
          uptimeDays,
        });
      }
    });
    
    // Then, add any validators from RPC that aren't in our database yet
    // (This catches delinquent validators that haven't been processed)
    rpcStakeMap.forEach((rpcStake, votePubkey) => {
      if (!processedVotePubkeys.has(votePubkey) && rpcStake > 0) {
        // Calculate uptime percentage from aggregated data
        const uptimeData = uptimeMap.get(votePubkey);
        let uptimePercent: number | null = null;
        let uptimeDays: number | null = null;
        
        if (uptimeData && uptimeData.totalChecks > 0) {
          const upChecks = uptimeData.totalChecks - uptimeData.delinquentChecks;
          uptimePercent = (upChecks / uptimeData.totalChecks) * 100;
          uptimeDays = uptimeData.days;
        }
        
        validatorsWithStake.push({
          votePubkey,
          identityPubkey: null,
          name: null,
          iconUrl: null,
          version: null,
          commission: 0, // Will be populated by snapshot job
          activeStake: rpcStake,
          activatingStake: 0,
          deactivatingStake: 0,
          delinquent: delinquentSet.has(votePubkey),
          stakeAccountCount: 0, // Will be populated by snapshot job
          uptimePercent,
          uptimeDays,
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
        jitoEnabled: validator.jitoEnabled || false,
        mevCommission: validator.mevCommission ?? null,
        delinquent: validator.delinquent,
        rank: index + 1,
        stakeAccountCount: validator.stakeAccountCount,
        uptimePercent: validator.uptimePercent,
        uptimeDays: validator.uptimeDays,
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
