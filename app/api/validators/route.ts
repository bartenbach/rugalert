import { Connection, clusterApiUrl } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../../lib/db-neon";

// Force dynamic rendering (query params)
export const dynamic = 'force-dynamic';

// Cache for 5 minutes to improve performance
export const revalidate = 300;

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
    
    // Helper to convert lamports to SOL
    const LAMPORTS_PER_SOL = 1_000_000_000;
    const lamportsToSol = (lamports: number) => lamports / LAMPORTS_PER_SOL;
    
    // Calculate real-time network totals from RPC (convert to SOL)
    const totalActiveStake = voteAccounts.current.reduce(
      (sum, v) => sum + lamportsToSol(v.activatedStake),
      0
    );
    const totalDelinquentStake = voteAccounts.delinquent.reduce(
      (sum, v) => sum + lamportsToSol(v.activatedStake),
      0
    );
    const networkTotalStake = totalActiveStake + totalDelinquentStake;
    
    // Build maps for RPC stake data and delinquent status (in SOL)
    const rpcStakeMap = new Map<string, number>();
    const delinquentSet = new Set<string>();
    
    voteAccounts.current.forEach((v: any) => {
      rpcStakeMap.set(v.votePubkey, lamportsToSol(v.activatedStake));
    });
    
    voteAccounts.delinquent.forEach((v: any) => {
      rpcStakeMap.set(v.votePubkey, lamportsToSol(v.activatedStake));
      delinquentSet.add(v.votePubkey);
    });

    // Fetch all validators (only the fields we need)
    const validatorsMap = new Map<string, any>();
    const validators = await sql`
      SELECT 
        vote_pubkey, 
        identity_pubkey, 
        name, 
        icon_url, 
        version, 
        commission, 
        stake_account_count, 
        jito_enabled, 
        active_stake, 
        activating_stake, 
        deactivating_stake,
        delinquent_since
      FROM validators
    `;
    
    validators.forEach((record: any) => {
      const votePubkey = record.vote_pubkey;
      const jitoEnabled = Boolean(record.jito_enabled);
      
      // Convert BigInt/lamports to Number (SOL)
      const lamportsToSolFromDb = (val: any) => {
        if (val === null || val === undefined) return 0;
        const lamports = typeof val === 'bigint' ? Number(val) : Number(val);
        return lamports / LAMPORTS_PER_SOL;
      };
      
      const toNumber = (val: any) => {
        if (typeof val === 'bigint') return Number(val);
        if (val === null || val === undefined) return 0;
        return Number(val);
      };
      
      validatorsMap.set(votePubkey, {
        votePubkey,
        identityPubkey: record.identity_pubkey,
        name: record.name || null,
        iconUrl: record.icon_url || null,
        version: record.version || null,
        stakeAccountCount: toNumber(record.stake_account_count),
        commission: toNumber(record.commission),
        jitoEnabled,
        activeStake: lamportsToSolFromDb(record.active_stake),
        activatingStake: lamportsToSolFromDb(record.activating_stake),
        deactivatingStake: lamportsToSolFromDb(record.deactivating_stake),
        delinquentSince: record.delinquent_since ? new Date(record.delinquent_since).toISOString() : null,
      });
    });

    // Fetch latest MEV commission from mev_snapshots
    const validatorVotePubkeys = Array.from(validatorsMap.keys());
    
    // Get list of validators with Jito enabled (only these can have MEV commission)
    const jitoEnabledSet = new Set(
      Array.from(validatorsMap.values())
        .filter(v => v.jitoEnabled)
        .map(v => v.votePubkey)
    );
    
    // Fetch most recent MEV snapshot per validator (DISTINCT ON for latest epoch)
    const mevCommissionMap = new Map<string, number>();
    if (jitoEnabledSet.size > 0) {
      const mevSnapshots = await sql`
        SELECT DISTINCT ON (vote_pubkey) 
          vote_pubkey, 
          mev_commission, 
          epoch
        FROM mev_snapshots
        WHERE vote_pubkey = ANY(${Array.from(jitoEnabledSet)})
        ORDER BY vote_pubkey, epoch DESC
        LIMIT 2000
      `;
      
      mevSnapshots.forEach((record: any) => {
        mevCommissionMap.set(record.vote_pubkey, Number(record.mev_commission || 0));
      });
    }

    // Fetch uptime data from daily_uptime table
    const uptimeMap = new Map<string, { totalChecks: number; delinquentChecks: number; days: number }>();
    if (validatorVotePubkeys.length > 0) {
      const uptimeRecords = await sql`
        SELECT 
          vote_pubkey, 
          uptime_checks, 
          delinquent_checks, 
          date
        FROM daily_uptime
        WHERE vote_pubkey = ANY(${validatorVotePubkeys})
        ORDER BY date DESC
        LIMIT 7000
      `;
      
      uptimeRecords.forEach((record: any) => {
        const votePubkey = record.vote_pubkey;
        const uptimeChecks = Number(record.uptime_checks || 0);
        const delinquentChecks = Number(record.delinquent_checks || 0);
        
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
    }

    // Fetch previous epoch ranks for rank change calculation
    const previousEpoch = currentEpoch - 1;
    const previousRankMap = new Map<string, number>();
    if (validatorVotePubkeys.length > 0 && previousEpoch >= 0) {
      const previousRanks = await sql`
        SELECT vote_pubkey, rank
        FROM stake_history
        WHERE epoch = ${previousEpoch}
          AND vote_pubkey = ANY(${validatorVotePubkeys})
          AND rank IS NOT NULL
      `;
      
      previousRanks.forEach((record: any) => {
        previousRankMap.set(record.vote_pubkey, Number(record.rank));
      });
    }

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
        
        // Calculate rank change (previous - current = positive means moved up)
        const previousRank = previousRankMap.get(votePubkey);
        let rankChange: number | null = null;
        // We'll calculate current rank after sorting, so we'll come back to this
        
        // Calculate delinquency duration if delinquent
        const isDelinquent = delinquentSet.has(votePubkey);
        let delinquentDurationMs: number | null = null;
        if (isDelinquent && validator.delinquentSince) {
          const delinquentSince = new Date(validator.delinquentSince);
          delinquentDurationMs = Date.now() - delinquentSince.getTime();
        }
        
        validatorsWithStake.push({
          ...validator,
          commission: Number(validator.commission || 0),
          activeStake,
          activatingStake: Number(validator.activatingStake || 0),
          deactivatingStake: Number(validator.deactivatingStake || 0),
          // Override delinquent status with real-time RPC data
          delinquent: isDelinquent,
          delinquentDurationMs,
          mevCommission: mevCommissionMap.get(votePubkey) ?? null,
          uptimePercent,
          uptimeDays,
          previousRank: previousRank ?? null,
        });
      }
    });
    
    // Then, add any validators from RPC that aren't in our database yet
    rpcStakeMap.forEach((rpcStake, votePubkey) => {
      if (!processedVotePubkeys.has(votePubkey) && rpcStake > 0) {
        const uptimeData = uptimeMap.get(votePubkey);
        let uptimePercent: number | null = null;
        let uptimeDays: number | null = null;
        
        if (uptimeData && uptimeData.totalChecks > 0) {
          const upChecks = uptimeData.totalChecks - uptimeData.delinquentChecks;
          uptimePercent = (upChecks / uptimeData.totalChecks) * 100;
          uptimeDays = uptimeData.days;
        }
        
        const previousRank = previousRankMap.get(votePubkey);
        
        const isDelinquent = delinquentSet.has(votePubkey);
        // For validators not in our DB, we don't have delinquent_since, so duration will be null
        validatorsWithStake.push({
          votePubkey,
          identityPubkey: null,
          name: null,
          iconUrl: null,
          version: null,
          commission: 0,
          activeStake: rpcStake,
          activatingStake: 0,
          deactivatingStake: 0,
          delinquent: isDelinquent,
          delinquentDurationMs: null, // No history for validators not in DB
          stakeAccountCount: 0,
          uptimePercent,
          uptimeDays,
          previousRank: previousRank ?? null,
        });
      }
    });

    // Deduplicate by votePubkey
    const seen = new Set<string>();
    const deduplicatedValidators = validatorsWithStake.filter((validator) => {
      if (seen.has(validator.votePubkey)) {
        return false;
      }
      seen.add(validator.votePubkey);
      return true;
    });

    // Sort by activeStake DESC first (before calculating cumulative)
    deduplicatedValidators.sort((a, b) => b.activeStake - a.activeStake);

    // Calculate rank, stake percentage, and cumulative stake percentage for each validator
    let cumulativeStake = 0;
    deduplicatedValidators.forEach((validator, index) => {
      const currentRank = index + 1; // Rank starts at 1
      validator.rank = currentRank;
      
      // Calculate rank change (previous - current = positive means moved up)
      if (validator.previousRank !== null && validator.previousRank !== undefined) {
        validator.rankChange = validator.previousRank - currentRank;
      } else {
        validator.rankChange = null; // New validator or no previous data
      }
      
      validator.stakePercent = networkTotalStake > 0 
        ? (validator.activeStake / networkTotalStake) * 100 
        : 0;
      
      // Cumulative stake percentage (running total)
      cumulativeStake += validator.activeStake;
      validator.cumulativeStakePercent = networkTotalStake > 0
        ? (cumulativeStake / networkTotalStake) * 100
        : 0;
    });

    // Apply pagination if requested
    let paginatedValidators = deduplicatedValidators;
    if (pageSize > 0) {
      const start = page * pageSize;
      const end = start + pageSize;
      paginatedValidators = deduplicatedValidators.slice(start, end);
    }

    // Calculate network statistics
    // Use RPC vote accounts for accurate validator counts (matches solana CLI)
    const networkStats = {
      totalValidators: voteAccounts.current.length + voteAccounts.delinquent.length,
      activeValidators: voteAccounts.current.length,
      delinquentValidators: voteAccounts.delinquent.length,
      totalStake: networkTotalStake,
      activeStake: totalActiveStake,
      delinquentStake: totalDelinquentStake,
    };

    return NextResponse.json({
      validators: paginatedValidators,
      total: deduplicatedValidators.length,
      currentEpoch,
      networkTotalStake,
      networkStats,
    });
  } catch (error: any) {
    console.error("Error fetching validators:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch validators" },
      { status: 500 }
    );
  }
}
