import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

async function rpc(method: string, params: any[] = []) {
  const res = await fetch(process.env.RPC_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(JSON.stringify(json.error || res.status));
  return json.result;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const votePubkey = searchParams.get('votePubkey');
    
    if (!votePubkey) {
      return NextResponse.json({ error: 'votePubkey parameter required' }, { status: 400 });
    }

    // Get current epoch for comparison
    const epochInfo = await rpc("getEpochInfo", []);
    const currentEpoch = Number(epochInfo.epoch);

    // Fetch ALL stake accounts for this validator
    console.log(`🔍 Fetching stake accounts for ${votePubkey.substring(0, 8)}...`);
    
    const response = await rpc("getProgramAccounts", [
      "Stake11111111111111111111111111111111111111",
      {
        encoding: "jsonParsed",
        filters: [
          { dataSize: 200 },
          {
            memcmp: {
              offset: 124, // Voter pubkey offset in stake account
              bytes: votePubkey,
            },
          },
        ],
      },
    ]);

    const accounts = response || [];
    console.log(`📊 Found ${accounts.length} stake accounts`);

    // Process each account and show detailed info
    const accountDetails = accounts.map((acc: any, idx: number) => {
      const stakeData = acc?.account?.data?.parsed?.info?.stake;
      const meta = acc?.account?.data?.parsed?.info?.meta;
      
      if (!stakeData?.delegation) {
        return { index: idx, error: 'No delegation found' };
      }

      const delegation = stakeData.delegation;
      const activationEpoch = Number(delegation.activationEpoch || 0);
      const deactivationEpoch = Number(delegation.deactivationEpoch || Number.MAX_SAFE_INTEGER);
      const delegatedStake = Number(delegation.stake || 0);

      return {
        index: idx,
        pubkey: acc.pubkey,
        voter: delegation.voter,
        activationEpoch,
        deactivationEpoch: deactivationEpoch === Number.MAX_SAFE_INTEGER ? 'Not set' : deactivationEpoch,
        delegatedStake: delegatedStake,
        delegatedStakeSOL: (delegatedStake / 1_000_000_000).toFixed(2),
        // Try to find active/inactive portions if they exist
        fullStakeData: stakeData,
        meta,
        isDeactivating: deactivationEpoch !== Number.MAX_SAFE_INTEGER,
        isActivating: activationEpoch >= currentEpoch,
      };
    });

    // Calculate totals
    const totals = accountDetails.reduce((acc, acct: any) => {
      if (acct.delegatedStake) {
        acc.total += acct.delegatedStake;
        if (acct.isActivating) acc.activating += acct.delegatedStake;
        if (acct.isDeactivating) acc.deactivating += acct.delegatedStake;
      }
      return acc;
    }, { total: 0, activating: 0, deactivating: 0 });

    return NextResponse.json({
      votePubkey,
      currentEpoch,
      accountCount: accounts.length,
      accounts: accountDetails,
      totals: {
        total: totals.total,
        totalSOL: (totals.total / 1_000_000_000).toFixed(2),
        activating: totals.activating,
        activatingSOL: (totals.activating / 1_000_000_000).toFixed(2),
        deactivating: totals.deactivating,
        deactivatingSOL: (totals.deactivating / 1_000_000_000).toFixed(2),
      },
    });

  } catch (error: any) {
    console.error("❌ Debug stake account error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch stake accounts" },
      { status: 500 }
    );
  }
}

