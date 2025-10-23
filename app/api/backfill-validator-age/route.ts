import { NextRequest, NextResponse } from "next/server";
import { tb } from "../../../lib/airtable";

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

/**
 * Backfill validator firstSeenEpoch from Stakewiz API
 * 
 * This endpoint fetches validator age data from Stakewiz and updates
 * the firstSeenEpoch field for existing validators that don't have it set.
 * 
 * Usage: POST /api/backfill-validator-age with Authorization header
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

    // Fetch all validators without firstSeenEpoch
    const validatorsToUpdate: { id: string; fields: { firstSeenEpoch: number } }[] = [];
    const validatorsMap = new Map<string, { id: string; identityPubkey: string }>();

    await tb.validators
      .select({
        fields: ['votePubkey', 'identityPubkey', 'firstSeenEpoch'],
        pageSize: 100,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const votePubkey = record.get('votePubkey') as string;
          const identityPubkey = record.get('identityPubkey') as string;
          const firstSeenEpoch = record.get('firstSeenEpoch') as number | undefined;
          
          // Only process validators that don't have firstSeenEpoch set
          if (!firstSeenEpoch && identityPubkey) {
            validatorsMap.set(votePubkey, { id: record.id, identityPubkey });
          }
        });
        fetchNextPage();
      });

    console.log(`📊 Found ${validatorsMap.size} validators without firstSeenEpoch`);

    if (validatorsMap.size === 0) {
      return NextResponse.json({
        success: true,
        message: "No validators need backfilling",
        updated: 0,
      });
    }

    // Fetch validator data from Stakewiz API
    // They use identity pubkey, not vote pubkey
    console.log(`🔍 Fetching validator age data from Stakewiz...`);
    
    let successCount = 0;
    let failCount = 0;
    let rateLimitWait = 100; // Start with 100ms delay between requests

    for (const [votePubkey, { id, identityPubkey }] of validatorsMap.entries()) {
      try {
        // Rate limit: wait between requests
        await new Promise(resolve => setTimeout(resolve, rateLimitWait));

        const response = await fetch(
          `https://api.stakewiz.com/validator/${identityPubkey}`,
          {
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (!response.ok) {
          console.log(`⚠️  ${votePubkey.substring(0, 8)}... - Stakewiz returned ${response.status}`);
          failCount++;
          continue;
        }

        const data = await response.json();
        
        // Stakewiz returns activated_stake_lamports_by_epoch array
        // The first entry is the epoch when they first appeared
        if (data.activated_stake_lamports_by_epoch && Array.isArray(data.activated_stake_lamports_by_epoch)) {
          const epochs = data.activated_stake_lamports_by_epoch.map((entry: any) => entry.epoch);
          const firstEpoch = Math.min(...epochs);
          
          if (firstEpoch && firstEpoch > 0 && firstEpoch < 10000) { // Sanity check
            validatorsToUpdate.push({
              id,
              fields: { firstSeenEpoch: firstEpoch }
            });
            successCount++;
            
            if (successCount % 50 === 0) {
              console.log(`✅ Processed ${successCount}/${validatorsMap.size} validators...`);
            }
          } else {
            console.log(`⚠️  ${votePubkey.substring(0, 8)}... - Invalid epoch: ${firstEpoch}`);
            failCount++;
          }
        } else {
          console.log(`⚠️  ${votePubkey.substring(0, 8)}... - No stake history in Stakewiz data`);
          failCount++;
        }
      } catch (error: any) {
        console.error(`❌ ${votePubkey.substring(0, 8)}... - Error: ${error.message}`);
        failCount++;
        
        // If we're getting rate limited, slow down
        if (error.message?.includes('429') || error.message?.includes('rate')) {
          rateLimitWait = Math.min(rateLimitWait * 2, 5000); // Max 5 seconds
          console.log(`⏰ Increasing rate limit delay to ${rateLimitWait}ms`);
        }
      }
    }

    console.log(`\n📊 Backfill Stats:`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Failed: ${failCount}`);
    console.log(`  📝 Ready to update: ${validatorsToUpdate.length}`);

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
        totalValidators: validatorsMap.size,
        successfulFetches: successCount,
        failedFetches: failCount,
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

