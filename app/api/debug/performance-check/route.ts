import { tb } from "@/lib/airtable";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const votePubkey = searchParams.get("votePubkey");
    
    if (!votePubkey) {
      return NextResponse.json({ error: "votePubkey required" }, { status: 400 });
    }

    // Fetch the latest performance record for this validator
    const perfRecords = await tb.performanceHistory
      .select({
        filterByFormula: `{votePubkey} = "${votePubkey}"`,
        sort: [{ field: "epoch", direction: "desc" }],
        maxRecords: 1,
      })
      .firstPage();

    if (perfRecords.length === 0) {
      return NextResponse.json({ error: "No performance records found" }, { status: 404 });
    }

    const record = perfRecords[0];
    const fields = record.fields;

    // Log all fields to see exactly what's in Airtable
    console.log("Performance record fields:", JSON.stringify(fields, null, 2));

    // Check for various possible field names (case variations)
    const possibleLeaderSlotsFields = ['leaderSlots', 'leaderslots', 'LeaderSlots', 'leader_slots'];
    const possibleBlocksProducedFields = ['blocksProduced', 'blocksproduced', 'BlocksProduced', 'blocks_produced'];

    const foundFields = {
      leaderSlots: {},
      blocksProduced: {},
    };

    for (const fieldName of possibleLeaderSlotsFields) {
      if (fieldName in fields) {
        foundFields.leaderSlots = {
          fieldName,
          value: fields[fieldName],
          type: typeof fields[fieldName],
        };
        break;
      }
    }

    for (const fieldName of possibleBlocksProducedFields) {
      if (fieldName in fields) {
        foundFields.blocksProduced = {
          fieldName,
          value: fields[fieldName],
          type: typeof fields[fieldName],
        };
        break;
      }
    }

    return NextResponse.json({
      votePubkey,
      epoch: fields.epoch,
      skipRate: fields.skipRate,
      allFields: fields,
      foundFields,
      allFieldNames: Object.keys(fields),
    }, {
      headers: {
        'Cache-Control': 'no-store',
      }
    });
  } catch (error: any) {
    console.error("Performance check error:", error);
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}

