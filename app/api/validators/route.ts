import { Connection, clusterApiUrl } from "@solana/web3.js";
import Airtable from "airtable";
import { NextRequest, NextResponse } from "next/server";

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY,
}).base(process.env.AIRTABLE_BASE_ID!);

const VALIDATORS_TABLE = "validators";
const STAKE_HISTORY_TABLE = "stake_history";
const SNAPSHOTS_TABLE = "snapshots";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "100");

    // Get current epoch
    const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");
    const connection = new Connection(rpcUrl);
    const epochInfo = await connection.getEpochInfo();
    const currentEpoch = epochInfo.epoch;

    // Fetch all validators
    const validatorsMap = new Map<string, any>();
    await base(VALIDATORS_TABLE)
      .select({
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
            delinquent: Boolean(record.fields.delinquent),
            commission: 0, // Will be filled from snapshots
          });
        });
        fetchNextPage();
      });

    // Fetch latest commission from snapshots
    // Instead of filtering by exact epoch, get the most recent snapshot for each validator
    const commissionMap = new Map<string, { commission: number; epoch: number }>();
    await base(SNAPSHOTS_TABLE)
      .select({
        pageSize: 100,
        sort: [{ field: 'epoch', direction: 'desc' }],
      })
      .eachPage((pageRecords, fetchNextPage) => {
        pageRecords.forEach((record) => {
          const votePubkey = record.fields.votePubkey as string;
          const commission = Number(record.fields.commission || 0);
          const epoch = Number(record.fields.epoch || 0);
          
          // Keep only the most recent snapshot for each validator
          if (!commissionMap.has(votePubkey) || (commissionMap.get(votePubkey)!.epoch < epoch)) {
            commissionMap.set(votePubkey, { commission, epoch });
          }
        });
        fetchNextPage();
      });

    // Fetch latest stake data for current epoch
    const stakeRecords: any[] = [];
    await base(STAKE_HISTORY_TABLE)
      .select({
        filterByFormula: `{epoch} = ${currentEpoch}`,
        pageSize: 100,
      })
      .eachPage((pageRecords, fetchNextPage) => {
        stakeRecords.push(...pageRecords);
        fetchNextPage();
      });

    // Merge validators with their stake and commission data
    const validatorsWithStake: any[] = [];
    stakeRecords.forEach((stakeRecord) => {
      const votePubkey = stakeRecord.fields.votePubkey as string;
      const validator = validatorsMap.get(votePubkey);
      
      if (validator) {
        const commissionData = commissionMap.get(votePubkey);
        validatorsWithStake.push({
          ...validator,
          commission: commissionData?.commission || 0,
          activeStake: Number(stakeRecord.fields.activeStake || 0),
          activatingStake: Number(stakeRecord.fields.activatingStake || 0),
          deactivatingStake: Number(stakeRecord.fields.deactivatingStake || 0),
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

    // Paginate on our side
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const validators = allValidators.slice(startIndex, endIndex);
    const hasMore = endIndex < allValidators.length;

    return NextResponse.json({
      validators,
      page,
      pageSize,
      hasMore,
      total: allValidators.length,
    });
  } catch (error: any) {
    console.error("Failed to fetch validators:", error);
    return NextResponse.json(
      { error: "Failed to fetch validators", details: error.message },
      { status: 500 }
    );
  }
}
