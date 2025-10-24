import { NextRequest, NextResponse } from "next/server";
import { tb } from "../../../lib/airtable";

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

/**
 * Backfill validator firstSeenEpoch from provided data
 * 
 * This endpoint accepts validator age data in the request body and updates
 * the firstSeenEpoch field for existing validators.
 * 
 * Usage: POST /api/backfill-validator-age with Authorization header
 * Body: { "validators": [{"votePubkey": "...", "firstSeenEpoch": 123}, ...] }
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const hasValidAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  
  if (!hasValidAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const startTime = Date.now();
    console.log(`\n🔄 === VALIDATOR AGE BACKFILL START ===`);

    // Parse the request body
    const body = await req.json();
    const validatorAgeData = body.validators as Array<{ votePubkey: string; firstSeenEpoch: number }>;

    if (!validatorAgeData || !Array.isArray(validatorAgeData)) {
      return NextResponse.json(
        { error: "Invalid request body. Expected { validators: [{votePubkey, firstSeenEpoch}] }" },
        { status: 400 }
      );
    }

    console.log(`📊 Received age data for ${validatorAgeData.length} validators`);

    // Create a map of votePubkey -> firstSeenEpoch
    const ageMap = new Map<string, number>();
    validatorAgeData.forEach(({ votePubkey, firstSeenEpoch }) => {
      ageMap.set(votePubkey, firstSeenEpoch);
    });

    // Fetch all validators from Airtable
    const validatorsToUpdate: { id: string; fields: { firstSeenEpoch: number } }[] = [];
    const validatorsMap = new Map<string, string>(); // votePubkey -> recordId

    await tb.validators
      .select({
        fields: ['votePubkey', 'firstSeenEpoch'],
        pageSize: 100,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const votePubkey = record.get('votePubkey') as string;
          validatorsMap.set(votePubkey, record.id);
        });
        fetchNextPage();
      });

    console.log(`📊 Found ${validatorsMap.size} validators in database`);

    // Match validators and prepare updates
    let matched = 0;
    let notFound = 0;

    for (const [votePubkey, firstSeenEpoch] of ageMap.entries()) {
      const recordId = validatorsMap.get(votePubkey);
      
      if (recordId) {
        // Sanity check the epoch number
        if (firstSeenEpoch > 0 && firstSeenEpoch < 10000) {
          validatorsToUpdate.push({
            id: recordId,
            fields: { firstSeenEpoch }
          });
          matched++;
        } else {
          console.log(`⚠️  ${votePubkey.substring(0, 8)}... - Invalid epoch: ${firstSeenEpoch}`);
        }
      } else {
        notFound++;
        if (notFound <= 10) {
          console.log(`⚠️  ${votePubkey.substring(0, 8)}... - Not found in database`);
        }
      }
    }

    console.log(`\n📊 Matching Stats:`);
    console.log(`  ✅ Matched: ${matched}`);
    console.log(`  ❌ Not found: ${notFound}`);
    console.log(`  📝 Ready to update: ${validatorsToUpdate.length}`);

    if (validatorsToUpdate.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No validators to update",
        updated: 0,
      });
    }

    // Batch update Airtable
    console.log(`\n💾 Updating Airtable...`);
    const batchSize = 10;
    let updated = 0;

    for (let i = 0; i < validatorsToUpdate.length; i += batchSize) {
      const batch = validatorsToUpdate.slice(i, i + batchSize);
      try {
        await tb.validators.update(batch);
        updated += batch.length;
        console.log(`  Updated ${updated}/${validatorsToUpdate.length} validators`);
      } catch (error: any) {
        console.error(`❌ Batch update error:`, error.message);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Backfill complete in ${elapsed}s`);

    return NextResponse.json({
      success: true,
      stats: {
        providedValidators: validatorAgeData.length,
        matched,
        notFound,
        updated,
        elapsedSeconds: parseFloat(elapsed),
      }
    });

  } catch (error: any) {
    console.error("❌ Backfill error:", error);
    return NextResponse.json(
      { error: error.message || "Backfill failed" },
      { status: 500 }
    );
  }
}

