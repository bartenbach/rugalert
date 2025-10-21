import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'

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

export async function GET() {
  try {
    const epochInfo = await rpc("getEpochInfo", []);
    
    return NextResponse.json({
      epoch: Number(epochInfo.epoch),
      slotIndex: Number(epochInfo.slotIndex),
      slotsInEpoch: Number(epochInfo.slotsInEpoch),
      absoluteSlot: Number(epochInfo.absoluteSlot),
    });
  } catch (error: any) {
    console.error('❌ epoch-info error:', error);
    return NextResponse.json(
      { error: String(error?.message || error) },
      { status: 500 }
    );
  }
}


