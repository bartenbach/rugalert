import { NextRequest, NextResponse } from "next/server";
import { tb } from "../../../../lib/airtable";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const votePubkey = searchParams.get('votePubkey');
    
    if (!votePubkey) {
      return NextResponse.json({ error: 'votePubkey parameter required' }, { status: 400 });
    }

    const today = new Date().toISOString().split('T')[0];
    
    // Get today's record
    const records: any[] = [];
    await tb.dailyUptime
      .select({
        filterByFormula: `AND({votePubkey} = "${votePubkey}", {date} = "${today}")`,
        maxRecords: 1,
      })
      .eachPage((recs, fetchNextPage) => {
        records.push(...recs);
        fetchNextPage();
      });

    if (records.length === 0) {
      return NextResponse.json({ error: 'No record found for today' }, { status: 404 });
    }

    const record = records[0];
    const rawData = {
      id: record.id,
      key: record.get('key'),
      votePubkey: record.get('votePubkey'),
      date: record.get('date'),
      uptimeChecks: record.get('uptimeChecks'),
      delinquentChecks: record.get('delinquentChecks'),
      uptimePercent: record.get('uptimePercent'),
      createdTime: record._rawJson.createdTime,
    };

    // Also check current RPC status
    const rpcRes = await fetch(process.env.RPC_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getVoteAccounts", params: [] }),
    });
    const rpcJson = await rpcRes.json();
    const delinquentSet = new Set(rpcJson.result?.delinquent?.map((v: any) => v.votePubkey) || []);
    const currentlyDelinquent = delinquentSet.has(votePubkey);

    // Calculate what the values SHOULD be if we incremented now
    const uptimeChecks = Number(rawData.uptimeChecks || 0);
    const delinquentChecks = Number(rawData.delinquentChecks || 0);
    const expectedNextUptimeChecks = uptimeChecks + 1;
    const expectedNextDelinquentChecks = currentlyDelinquent ? delinquentChecks + 1 : delinquentChecks;
    const expectedNextUptimePercent = ((expectedNextUptimeChecks - expectedNextDelinquentChecks) / expectedNextUptimeChecks) * 100;

    return NextResponse.json({
      today,
      currentRecord: rawData,
      currentRPCStatus: {
        isDelinquent: currentlyDelinquent,
      },
      expectedNextValues: {
        uptimeChecks: expectedNextUptimeChecks,
        delinquentChecks: expectedNextDelinquentChecks,
        uptimePercent: expectedNextUptimePercent.toFixed(2),
      },
    });

  } catch (error: any) {
    console.error("❌ Debug uptime raw error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch uptime raw" },
      { status: 500 }
    );
  }
}

