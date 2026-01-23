/**
 * Backfill Client Type API
 * 
 * This endpoint populates the client_type column for all validators.
 * It should be run manually after adding the column to verify detection accuracy.
 * 
 * Client types are the BASE software only:
 * - agave: Standard Agave client
 * - frankendancer: Firedancer networking + Agave runtime (0.8xx versions)
 * - firedancer: Full Firedancer (1.x when released)
 * - unknown: Could not determine
 * 
 * Jito and BAM are tracked separately via jito_enabled and bam_enabled columns.
 * 
 * Usage:
 * POST /api/backfill-client-type
 * Headers: x-cron-secret: <CRON_SECRET>
 * 
 * Query params:
 * - dry_run=true: Don't write to DB, just return what would be detected
 * - limit=100: Limit number of validators to process (for testing)
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../../lib/db-neon";
import { detectClientType, ClientType } from "../../../lib/clientType";
import { fetchAllJitoValidators } from "../../../lib/jito";

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

// Helper to call RPC
async function rpc(method: string, params: any[] = []) {
  const url = process.env.RPC_URL || process.env.SOLANA_RPC_URL;
  if (!url) throw new Error('RPC_URL not configured');
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(JSON.stringify(json.error || res.status));
  return json.result;
}

export async function POST(req: NextRequest) {
  // Auth check
  const cronSecret = req.headers.get("x-cron-secret");
  const userAgent = req.headers.get("user-agent");
  const isAuthorized = cronSecret === process.env.CRON_SECRET || 
                       userAgent?.includes("vercel-cron");
  
  if (!isAuthorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get('dry_run') === 'true';
  const limit = parseInt(searchParams.get('limit') || '0', 10);

  console.log(`\n🔧 ========== BACKFILL CLIENT TYPE ==========`);
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  console.log(`🔧 Dry run: ${dryRun}`);
  console.log(`🔧 Limit: ${limit || 'none'}`);

  try {
    // Step 1: Fetch all validators from DB
    console.log(`\n📊 Fetching validators from database...`);
    let validators;
    if (limit > 0) {
      validators = await sql`
        SELECT vote_pubkey, identity_pubkey, name, version, jito_enabled, bam_enabled, active_stake
        FROM validators
        ORDER BY active_stake DESC NULLS LAST
        LIMIT ${limit}
      `;
    } else {
      validators = await sql`
        SELECT vote_pubkey, identity_pubkey, name, version, jito_enabled, bam_enabled, active_stake
        FROM validators
        ORDER BY active_stake DESC NULLS LAST
      `;
    }
    console.log(`✅ Found ${validators.length} validators`);

    // Step 2: Fetch cluster nodes for latest version info
    console.log(`\n📡 Fetching cluster nodes from RPC...`);
    const clusterNodes = await rpc("getClusterNodes", []);
    
    // Build version map: identity pubkey -> version
    const versionMap = new Map<string, string>();
    for (const node of clusterNodes as any[]) {
      if (node.pubkey && node.version) {
        versionMap.set(node.pubkey, node.version);
      }
    }
    console.log(`✅ Found ${versionMap.size} nodes with version info`);

    // Step 3: Fetch Jito validators (for reference/display, not for client type)
    console.log(`\n📡 Fetching Jito validators...`);
    const jitoValidators = await fetchAllJitoValidators();
    console.log(`✅ Found ${jitoValidators.size} Jito-enabled validators`);

    // Step 4: Detect client types
    console.log(`\n🔍 Detecting client types...`);
    
    const results: Array<{
      votePubkey: string;
      name: string | null;
      version: string | null;
      detectedVersion: string | null;
      clientType: ClientType;
      embeddedAgaveVersion: string | null;
      jitoEnabled: boolean;
      bamEnabled: boolean;
      confidence: string;
      activeStake: number;
    }> = [];

    const stats: Record<ClientType, number> = {
      'agave': 0,
      'frankendancer': 0,
      'firedancer': 0,
      'unknown': 0,
    };

    const stakeByClient: Record<ClientType, number> = {
      'agave': 0,
      'frankendancer': 0,
      'firedancer': 0,
      'unknown': 0,
    };

    // Track Jito/BAM separately
    let jitoCount = 0;
    let bamCount = 0;
    let jitoStake = 0;
    let bamStake = 0;

    for (const v of validators) {
      // Get latest version from cluster nodes (prefer over cached DB version)
      const liveVersion = v.identity_pubkey ? versionMap.get(v.identity_pubkey) : null;
      const version = liveVersion || v.version;
      
      // Get Jito/BAM status (these are separate from client type)
      const jitoInfo = jitoValidators.get(v.vote_pubkey);
      const isJitoEnabled = jitoInfo?.isJitoEnabled || Boolean(v.jito_enabled);
      const isBamEnabled = jitoInfo?.hasBam || Boolean(v.bam_enabled);

      // Detect client type (just the base software)
      const info = detectClientType(version);
      
      const stake = Number(v.active_stake || 0);
      stats[info.clientType]++;
      stakeByClient[info.clientType] += stake;
      
      // Track Jito/BAM separately
      if (isJitoEnabled) {
        jitoCount++;
        jitoStake += stake;
      }
      if (isBamEnabled) {
        bamCount++;
        bamStake += stake;
      }

      results.push({
        votePubkey: v.vote_pubkey,
        name: v.name,
        version: v.version,
        detectedVersion: liveVersion || null,
        clientType: info.clientType,
        embeddedAgaveVersion: info.embeddedAgaveVersion,
        jitoEnabled: isJitoEnabled,
        bamEnabled: isBamEnabled,
        confidence: info.confidence,
        activeStake: stake,
      });
    }

    // Calculate total stake for percentage
    const totalStake = Object.values(stakeByClient).reduce((a, b) => a + b, 0);

    console.log(`\n📊 Client Type Distribution (by count):`);
    for (const [type, count] of Object.entries(stats)) {
      if (count > 0) {
        const pct = ((count / validators.length) * 100).toFixed(1);
        console.log(`  ${type}: ${count} (${pct}%)`);
      }
    }
    
    console.log(`\n📊 Client Type Distribution (by stake):`);
    for (const [type, stake] of Object.entries(stakeByClient)) {
      if (stake > 0) {
        const pct = totalStake > 0 ? ((stake / totalStake) * 100).toFixed(2) : '0';
        const stakeSol = (stake / 1e9).toFixed(0);
        console.log(`  ${type}: ${stakeSol} SOL (${pct}%)`);
      }
    }
    
    console.log(`\n📊 Feature Distribution:`);
    console.log(`  Jito enabled: ${jitoCount} validators (${(jitoStake / 1e9).toFixed(0)} SOL, ${totalStake > 0 ? ((jitoStake / totalStake) * 100).toFixed(2) : 0}%)`);
    console.log(`  BAM enabled: ${bamCount} validators (${(bamStake / 1e9).toFixed(0)} SOL, ${totalStake > 0 ? ((bamStake / totalStake) * 100).toFixed(2) : 0}%)`);

    // Step 5: Write to database (unless dry run)
    let updated = 0;
    if (!dryRun) {
      console.log(`\n💾 Writing client types to database...`);
      
      for (const r of results) {
        await sql`
          UPDATE validators
          SET client_type = ${r.clientType}
          WHERE vote_pubkey = ${r.votePubkey}
        `;
        updated++;
        
        if (updated % 200 === 0) {
          console.log(`  Updated ${updated}/${results.length} validators...`);
        }
      }
      
      console.log(`✅ Updated ${updated} validators with client type`);
    } else {
      console.log(`\n⏭️  Dry run - no database changes made`);
    }

    // Show some examples of each type
    console.log(`\n📝 Sample validators by client type:`);
    for (const type of ['frankendancer', 'firedancer', 'agave', 'unknown'] as ClientType[]) {
      const samples = results
        .filter(r => r.clientType === type)
        .slice(0, 3);
      
      if (samples.length > 0) {
        console.log(`\n  ${type}:`);
        for (const s of samples) {
          const badges = [];
          if (s.jitoEnabled) badges.push('Jito');
          if (s.bamEnabled) badges.push('BAM');
          const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';
          const agaveStr = s.embeddedAgaveVersion ? ` (Agave ${s.embeddedAgaveVersion})` : '';
          console.log(`    - ${s.name || s.votePubkey.slice(0, 8)} v${s.detectedVersion || s.version || 'unknown'}${agaveStr}${badgeStr}`);
        }
      }
    }

    console.log(`\n🎉 ========== BACKFILL COMPLETE ==========\n`);

    return NextResponse.json({
      ok: true,
      dryRun,
      totalValidators: validators.length,
      updated: dryRun ? 0 : updated,
      clientStats: stats,
      clientStakeSol: Object.fromEntries(
        Object.entries(stakeByClient).map(([k, v]) => [k, Math.round(v / 1e9)])
      ),
      clientStakePercent: Object.fromEntries(
        Object.entries(stakeByClient).map(([k, v]) => [
          k, 
          totalStake > 0 ? ((v / totalStake) * 100).toFixed(2) + '%' : '0%'
        ])
      ),
      featureStats: {
        jito: { count: jitoCount, stakeSol: Math.round(jitoStake / 1e9) },
        bam: { count: bamCount, stakeSol: Math.round(bamStake / 1e9) },
      },
      // Include first 50 results for inspection
      sampleResults: results.slice(0, 50).map(r => ({
        votePubkey: r.votePubkey,
        name: r.name,
        version: r.detectedVersion || r.version,
        clientType: r.clientType,
        embeddedAgaveVersion: r.embeddedAgaveVersion,
        jitoEnabled: r.jitoEnabled,
        bamEnabled: r.bamEnabled,
        confidence: r.confidence,
      })),
    });
  } catch (error: any) {
    console.error(`❌ Backfill error:`, error);
    return NextResponse.json(
      { error: error.message || 'Backfill failed' },
      { status: 500 }
    );
  }
}

// Allow GET for easier testing
export async function GET(req: NextRequest) {
  // For GET, always do dry run
  const url = new URL(req.url);
  url.searchParams.set('dry_run', 'true');
  
  // Create a new request with the modified URL
  const newReq = new NextRequest(url, {
    method: 'POST',
    headers: req.headers,
  });
  
  return POST(newReq);
}
