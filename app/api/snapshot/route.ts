// This file contains the Neon version of the snapshot script
// It's being created alongside the original to allow for safe review before replacing
// Once verified, rename this to route.ts and delete the old Airtable version

import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../../lib/db-neon";
import { detectMevRug, fetchAllJitoValidators } from "../../../lib/jito";
import { getStakerLabel, type StakeAccountBreakdown } from "../../../lib/stakers";
import { formatTwitterMevRug, formatTwitterRug, postToTwitter } from "../../../lib/twitter";

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for Vercel Pro (max allowed)

// ---- raw JSON-RPC helper (works for vote/epoch and jsonParsed GPA) ----
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

async function sendDiscord(msg: string) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: msg }),
  });
}

async function sendEmail(subject: string, text: string, eventType: "RUG" | "CAUTION" | "INFO") {
  try {
    if (!process.env.RESEND_API_KEY || !process.env.ALERTS_FROM) {
      console.log("⚠️ Email skipped: Missing RESEND_API_KEY or ALERTS_FROM");
      return;
    }
    
    const subs = await sql`SELECT email, preferences FROM subscribers`;
    console.log(`📧 Found ${subs.length} total subscribers`);
    
    // Filter subscribers based on their preferences
    const eligibleSubs = subs.filter((s: any) => {
      const email = s.email;
      if (!email) return false;
      
      const preference = s.preferences || "rugs_only"; // Default to rugs_only
      
      console.log(`  Subscriber: ${email}, preference: ${preference}, eventType: ${eventType}`);
      
      // Determine if this subscriber should get this type of alert
      if (preference === "all") return true; // All events
      if (preference === "all_alerts") return true; // Legacy: treat as "all"
      if (preference === "all_events") return true; // Legacy: treat as "all"
      if (preference === "rugs_and_cautions" && (eventType === "RUG" || eventType === "CAUTION")) return true;
      if (preference === "rugs_only" && eventType === "RUG") return true;
      
      return false;
    });
    
    const emails = eligibleSubs.map((s: any) => s.email).filter(Boolean);
    console.log(`📧 Sending ${eventType} email to ${emails.length} recipients individually`);
    
    if (!emails.length) {
      console.log("⚠️ No eligible recipients for this event type");
      return;
    }
    
    // Send individual emails to each subscriber (protects PII)
    // Send sequentially with rate limiting to avoid 429 errors (Resend limit: 2 req/sec)
    console.log(`📧 Sending ${emails.length} emails individually...`);
    const results: { email: string; success: boolean; error?: any }[] = [];
    
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            from: process.env.ALERTS_FROM, 
            to: [email], // Send to one recipient at a time
            subject, 
            text: `${text}\n\n---\nTo unsubscribe from these alerts, visit:\n${process.env.BASE_URL || "https://rugalert.pumpkinspool.com"}/unsubscribe?email=${encodeURIComponent(email)}`
          }),
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          console.error(`❌ Email failed for ${email}:`, response.status, result);
          results.push({ email, success: false, error: result });
        } else {
          console.log(`✅ Email sent to ${email}`);
          results.push({ email, success: true });
        }
      } catch (error) {
        console.error(`❌ Email error for ${email}:`, error);
        results.push({ email, success: false, error });
      }
      
      // Rate limit: wait 600ms between emails (max 2 per second = 500ms, add buffer)
      if (i < emails.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`📧 Email batch complete: ${successCount}/${emails.length} sent successfully`);
    
  } catch (error) {
    console.error("❌ Email batch error:", error);
  }
}

// Handle GET requests (Vercel cron sometimes uses GET)
export async function GET(req: NextRequest) {
  const userAgent = req.headers.get("user-agent");
  
  // If it's from Vercel cron, redirect to POST handler
  if (userAgent?.includes("vercel-cron")) {
    // Call the main snapshot logic by forwarding to POST handler
    return POST(req);
  }
  
  return NextResponse.json({ 
    error: "Method not allowed. Use POST with x-cron-secret header.",
    hint: "This endpoint is designed to be called by Vercel Cron"
  }, { status: 405 });
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  const userAgent = req.headers.get("user-agent");
  
  // Allow if: has correct secret OR is from Vercel cron
  const isAuthorized = cronSecret === process.env.CRON_SECRET || 
                       userAgent?.includes("vercel-cron");
  
  if (!isAuthorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const logProgress = (step: string) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️  [${elapsed}s] ${step}`);
  };

  console.log(`\n🚀 ========== SNAPSHOT JOB STARTED ==========`);
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  console.log(`🔧 User-Agent: ${userAgent || 'none'}`);
  console.log(`🔑 Authorized: ${isAuthorized}`);

  // Log job start
  const jobRunResult = await sql`
    INSERT INTO job_runs (job_name, status, started_at)
    VALUES ('snapshot', 'running', NOW())
    RETURNING id
  `;
  const jobRunId = jobRunResult[0].id;
  console.log(`📝 Job run ID: ${jobRunId}`);

  try {
    logProgress("Starting snapshot job");
    
    // 1) Pull current vote accounts + epoch/slot + cluster nodes for versions
    // OPTIMIZATION: Parallelize initial RPC calls instead of sequential
    logProgress("Fetching initial RPC data (parallelized)...");
    const [votes, epochInfo, clusterNodes] = await Promise.all([
      rpc("getVoteAccounts", []),
      rpc("getEpochInfo", []),
      rpc("getClusterNodes", []),
    ]);
    const epoch = Number(epochInfo.epoch);
    const slot = Number(epochInfo.absoluteSlot);
    logProgress(`Fetched RPC data: epoch ${epoch}, slot ${slot}`);
    
    // Track which validators are delinquent
    const delinquentSet = new Set<string>();
    votes.delinquent.forEach((v: any) => {
      delinquentSet.add(v.votePubkey);
    });
    
    const allVotes = [...votes.current, ...votes.delinquent] as Array<{
      votePubkey: string;
      nodePubkey: string;   // identity pubkey
      commission: number;
      activatedStake: number;
    }>;

    // Build a map of identity pubkey -> version from cluster nodes
    const versionMap = new Map<string, string>();
    for (const node of clusterNodes as any[]) {
      if (node.pubkey && node.version) {
        versionMap.set(node.pubkey, node.version);
      }
    }

    // Fetch Jito MEV commission data for all validators
    logProgress("Fetching Jito MEV data...");
    const jitoValidators = await fetchAllJitoValidators();
    logProgress(`Found ${jitoValidators.size} Jito-enabled validators`);

    // Track stake and performance metrics
    let stakeRecordsCreated = 0;
    let performanceRecordsCreated = 0;
    let mevSnapshotsCreated = 0;
    let mevEventsCreated = 0;
    
    // Get block production data for skip rate calculation (current epoch only)
    logProgress("Fetching block production data...");
    const blockProduction = await rpc("getBlockProduction", [{ epoch }]);
    const blockProductionData = blockProduction?.value?.byIdentity || {};
    logProgress("Block production data fetched");
    
    // Get full leader schedule for total leader slots (not just elapsed)
    logProgress("Fetching leader schedule...");
    // getLeaderSchedule returns data keyed by IDENTITY pubkey (nodePubkey)
    // Call with [null] to get current epoch's schedule
    const leaderSchedule = await rpc("getLeaderSchedule", [null]);
    const leaderScheduleData: Record<string, number[]> = leaderSchedule || {};
    logProgress(`Leader schedule fetched (${Object.keys(leaderScheduleData).length} validators)`);
    
    // Debug: Log first few validators with leader slots
    const sampleKeys = Object.keys(leaderScheduleData).slice(0, 5);
    console.log(`\n🔍 LEADER SCHEDULE DEBUG (first 5):`);
    for (const key of sampleKeys) {
      const slots = leaderScheduleData[key];
      console.log(`  Identity: ${key} → ${slots?.length || 0} leader slots`);
    }
    
    // Create a mapping of nodePubkey to vote data for quick lookup
    const nodePubkeyToVote = new Map<string, any>();
    for (const v of allVotes) {
      nodePubkeyToVote.set(v.nodePubkey, v);
    }
    
    // Debug: Check how many validators from allVotes are in the leader schedule
    let foundInSchedule = 0;
    let notFoundInSchedule = 0;
    for (const v of allVotes.slice(0, 10)) {
      if (leaderScheduleData[v.nodePubkey]) {
        foundInSchedule++;
      } else {
        notFoundInSchedule++;
        if (notFoundInSchedule <= 3) {
          console.log(`  ⚠️ NOT FOUND: vote=${v.votePubkey.substring(0, 8)}... identity=${v.nodePubkey.substring(0, 8)}... not in leader schedule`);
        }
      }
    }
    console.log(`📊 Leader schedule coverage (first 10 validators): ${foundInSchedule} found, ${notFoundInSchedule} not found\n`)
    
    // Fetch ALL stake accounts at once to avoid per-validator RPC calls
    // WARNING: This can be very expensive on mainnet (millions of accounts)
    // Set ENABLE_STAKE_TRACKING=false to disable if causing timeouts
    let stakeByVoter = new Map<string, { 
      activating: number; 
      deactivating: number;
      activatingAccounts: StakeAccountBreakdown[];
      deactivatingAccounts: StakeAccountBreakdown[];
    }>();
    let stakeAccountCounts = new Map<string, number>(); // Count of stake accounts per validator
    let stakeDistribution = new Map<string, Map<string, number>>(); // voter -> (staker -> total stake amount)
    const enableStakeTracking = process.env.ENABLE_STAKE_TRACKING !== 'false';
    
    if (enableStakeTracking) {
      logProgress("Fetching all stake accounts with pagination...");
      try {
        // Use Helius getProgramAccountsV2 with pagination
        const allStakeAccounts: any[] = [];
        let paginationKey: string | null = null;
        let pageCount = 0;
        // Increased limit - we need ALL accounts for accurate data
        // Each page = 5K accounts, so 250 pages = 1.25M accounts
        const MAX_PAGES = 250; // Was 200 (1M accounts), now 250 (1.25M accounts)
        
        do {
          pageCount++;
          const params: any = {
            encoding: "jsonParsed",
            filters: [{ dataSize: 200 }],
            limit: 5000, // Helius recommends 1000-5000
          };
          
          if (paginationKey) {
            params.paginationKey = paginationKey;
          }
          
          try {
            const response = await rpc("getProgramAccountsV2", [
              "Stake11111111111111111111111111111111111111",
              params,
            ]);
            
            const accounts = response.accounts || [];
            allStakeAccounts.push(...accounts);
            paginationKey = response.paginationKey || null;
            
            // Log progress every 50 pages to reduce noise
            if (pageCount % 50 === 0 || !paginationKey) {
              logProgress(`Fetched ${pageCount} pages: ${allStakeAccounts.length} accounts`);
            }
          } catch (pageError: any) {
            console.log(`⚠️  Page ${pageCount} failed (${pageError.message}), continuing with ${allStakeAccounts.length} accounts`);
            break; // Stop pagination on error, use what we have
          }
          
          // Stop if we hit page limit
          if (pageCount >= MAX_PAGES) {
            logProgress(`⚠️  Reached page limit (${MAX_PAGES}), continuing with ${allStakeAccounts.length} accounts`);
            break;
          }
        } while (paginationKey);
        
        logProgress(`Processing ${allStakeAccounts.length} stake accounts from ${pageCount} pages...`);
        
        // Group stake by voter pubkey and count accounts
        for (const account of allStakeAccounts as any[]) {
          const stakeData = account?.account?.data?.parsed?.info?.stake;
          const meta = account?.account?.data?.parsed?.info?.meta;
          if (stakeData?.delegation && meta?.authorized?.staker) {
            const delegation = stakeData.delegation;
            const voter = delegation.voter;
            const staker = meta.authorized.staker;
            const activationEpoch = Number(delegation.activationEpoch || 0);
            const deactivationEpoch = Number(delegation.deactivationEpoch || Number.MAX_SAFE_INTEGER);
            const stake = Number(delegation.stake || 0);
            
            // Count ALL stake accounts per validator (including inactive, activating, deactivating)
            stakeAccountCounts.set(voter, (stakeAccountCounts.get(voter) || 0) + 1);
            
            // Track stake distribution by staker (for pie chart)
            if (!stakeDistribution.has(voter)) {
              stakeDistribution.set(voter, new Map());
            }
            const voterDist = stakeDistribution.get(voter)!;
            voterDist.set(staker, (voterDist.get(staker) || 0) + stake);
            
            if (!stakeByVoter.has(voter)) {
              stakeByVoter.set(voter, { 
                activating: 0, 
                deactivating: 0,
                activatingAccounts: [],
                deactivatingAccounts: []
              });
            }
            
            const data = stakeByVoter.get(voter)!;
            
            // Stake is activating if activation epoch is current or future (still warming up)
            // Stake takes multiple epochs to fully activate
            if (activationEpoch >= epoch) {
              data.activating += stake;
              data.activatingAccounts.push({
                staker,
                amount: stake,
                label: getStakerLabel(staker),
                epoch: activationEpoch
              });
            }
            
            // Stake is deactivating if deactivation epoch equals CURRENT epoch
            // Once past the deactivation epoch, stake is fully deactivated (not "deactivating")
            // This prevents counting historical deactivations that are already complete
            if (deactivationEpoch === epoch) {
              data.deactivating += stake;
              data.deactivatingAccounts.push({
                staker,
                amount: stake,
                label: getStakerLabel(staker),
                epoch: deactivationEpoch
              });
            }
          }
        }
        logProgress(`Processed stake for ${stakeByVoter.size} voters, ${stakeAccountCounts.size} validators with accounts`);
      } catch (e: any) {
        console.log(`⚠️ Could not fetch stake accounts (continuing without activating/deactivating data):`, e?.message || e);
      }
    } else {
      console.log(`⏭️ Stake tracking disabled (set ENABLE_STAKE_TRACKING=true to enable)`);
    }
    
    // Extract vote credits from the vote accounts we already fetched
    console.log(`📊 Extracting vote credits for ${allVotes.length} validators (current epoch ${epoch})...`);
    const voteCreditsMap = new Map<string, number>();
    
    // Rebuild the full vote account list with epochCredits
    const allVoteAccounts = [...votes.current, ...votes.delinquent];
    
    for (const voteAccount of allVoteAccounts) {
      const epochCreditsArray = voteAccount.epochCredits;
          if (epochCreditsArray && Array.isArray(epochCreditsArray)) {
            // epochCredits format: [[epoch, cumulative_credits, prev_epoch_cumulative], ...]
        // Look for CURRENT epoch
            const currentEpochCredits = epochCreditsArray.find((entry: any) => 
              Number(entry[0]) === epoch
            );
            if (currentEpochCredits) {
          // Get credits earned in current epoch (current cumulative - previous cumulative)
              const earnedCredits = Number(currentEpochCredits[1]) - Number(currentEpochCredits[2] || 0);
          voteCreditsMap.set(voteAccount.votePubkey, earnedCredits);
        }
      }
    }
    
    // Find the max vote credits (best performing validator = 100%)
    let maxVoteCredits = 0;
    for (const credits of voteCreditsMap.values()) {
      if (credits > maxVoteCredits) {
        maxVoteCredits = credits;
      }
    }
    
    console.log(`✅ Fetched vote credits for ${voteCreditsMap.size} validators`);
    console.log(`📊 Max vote credits (best performer): ${maxVoteCredits}`);
    
    // PRE-FETCH existing records to avoid timeout from too many sequential calls
    console.log(`📊 Pre-fetching existing records for ${allVotes.length} validators...`);
    
    // Fetch all validators at once
    const existingValidators = new Map<string, any>();
    const allValidators = await sql`SELECT * FROM validators`;
    allValidators.forEach((v: any) => existingValidators.set(v.vote_pubkey, v));
    
    // Fetch existing stake records for this epoch
    const existingStakeKeys = new Set<string>();
    const stakeRecords = await sql`SELECT key FROM stake_history WHERE epoch = ${epoch}`;
    stakeRecords.forEach((r: any) => existingStakeKeys.add(r.key));
    
    // Fetch existing performance records for this epoch
    const existingPerfKeys = new Set<string>();
    const existingPerfRecords = new Map<string, any>();
    const perfRecords = await sql`SELECT * FROM performance_history WHERE epoch = ${epoch}`;
    perfRecords.forEach((r: any) => {
      existingPerfKeys.add(r.key);
      existingPerfRecords.set(r.key, r);
    });
    
    // Fetch existing MEV snapshots for this epoch
    const existingMevKeys = new Set<string>();
    const mevRecords = await sql`SELECT key FROM mev_snapshots WHERE epoch = ${epoch}`;
    mevRecords.forEach((r: any) => existingMevKeys.add(r.key));
    
    // Fetch latest MEV snapshot per validator (for change detection)
    const latestMevByValidator = new Map<string, any>();
    const latestMevSnapshots = await sql`
      SELECT DISTINCT ON (vote_pubkey) *
      FROM mev_snapshots
      ORDER BY vote_pubkey, epoch DESC
      LIMIT 2000
    `;
    latestMevSnapshots.forEach((r: any) => {
      latestMevByValidator.set(r.vote_pubkey, r);
    });
    
    // Fetch latest commission snapshot per validator (for change detection)
    logProgress(`Pre-fetching latest commission snapshots...`);
    const latestCommissionByValidator = new Map<string, { commission: number, epoch: number, slot: number }>();
    const latestSnapshots = await sql`
      SELECT DISTINCT ON (vote_pubkey) vote_pubkey, commission, epoch, slot
      FROM snapshots
      ORDER BY vote_pubkey, slot DESC
      LIMIT 2000
    `;
    latestSnapshots.forEach((r: any) => {
      latestCommissionByValidator.set(r.vote_pubkey, {
        commission: Number(r.commission || 0),
        epoch: Number(r.epoch || 0),
        slot: Number(r.slot || 0),
      });
    });
    
    logProgress(`Pre-fetch complete: ${existingValidators.size} validators, ${existingStakeKeys.size} stake, ${existingPerfKeys.size} perf, ${existingMevKeys.size} MEV, ${latestCommissionByValidator.size} commission`);
    
    // Batch arrays for bulk creation
    const validatorsToCreate: any[] = [];
    const validatorsToUpdate: any[] = [];
    const stakeRecordsToCreate: any[] = [];
    const perfRecordsToCreate: any[] = [];
    const perfRecordsToUpdate: any[] = [];
    const mevSnapshotsToCreate: any[] = [];
    const mevEventsToCreate: any[] = [];
    const snapshotsToCreate: any[] = [];
    const eventsToCreate: any[] = [];
    
    // Track snapshots we're creating in this run to avoid duplicates
    const snapshotsBeingCreated = new Set<string>();

    // 2) jsonParsed GPA over Config program (validatorInfo records)
    const gpa = await rpc("getProgramAccounts", [
      "Config1111111111111111111111111111111111111",
      { 
        encoding: "jsonParsed", 
        commitment: "confirmed",
      },
    ]);

    // identityPubkey -> { name, iconUrl, website, description }
    const infoMap = new Map<
      string,
      { name?: string; iconUrl?: string; website?: string; description?: string }
    >();

    for (const item of gpa as any[]) {
      const parsed = item?.account?.data?.parsed;
      if (!parsed || parsed.type !== "validatorInfo") continue;
      const keys = parsed?.info?.keys || [];
      const signer = keys.find((k: any) => k && k.signer && typeof k.pubkey === "string");
      const cfg = parsed?.info?.configData || {};
      const identity = signer?.pubkey as string | undefined;
      const name = typeof cfg.name === "string" && cfg.name.length ? cfg.name : undefined;
      const iconUrl = typeof cfg.iconUrl === "string" && cfg.iconUrl.length ? cfg.iconUrl : undefined;
      const website = typeof cfg.website === "string" && cfg.website.length ? cfg.website : undefined;
      const description = typeof cfg.details === "string" && cfg.details.length ? cfg.details : undefined;
      if (identity && (name || iconUrl || website || description)) {
        infoMap.set(identity, { name, iconUrl, website, description });
      }
    }

    // 2b) Fetch most recent validator info history for change detection
    console.log("📚 Fetching validator info history for change detection...");
    
    // Build map of votePubkey -> most recent info history
    const lastInfoMap = new Map<string, {
      identityPubkey: string | null;
      name: string | null;
      description: string | null;
      website: string | null;
      iconUrl: string | null;
    }>();
    
    let infoHistoryEnabled = true;
    
    try {
      console.log(`📚 Attempting to fetch validator_info_history table...`);
      logProgress(`Fetching validator info history for change detection...`);
      
      const allInfoHistory = await sql`
        SELECT DISTINCT ON (vote_pubkey) *
        FROM validator_info_history
        ORDER BY vote_pubkey, COALESCE(changed_at, created_at) DESC NULLS LAST
      `;
      
      console.log(`✅ Successfully fetched ${allInfoHistory.length} info history records`);
      logProgress(`Loaded ${allInfoHistory.length} info history records, processing...`);
      
      for (const record of allInfoHistory) {
        lastInfoMap.set(record.vote_pubkey, {
          identityPubkey: record.identity_pubkey || null,
          name: record.name || null,
          description: record.description || null,
          website: record.website || null,
          iconUrl: record.icon_url || null,
        });
      }
      console.log(`✅ Built info history map for ${lastInfoMap.size} validators`);
      logProgress(`Processed ${lastInfoMap.size} unique validator info records`);
    } catch (error: any) {
      console.error(`❌ VALIDATOR INFO HISTORY TABLE FETCH FAILED!`);
      console.error(`Error message: ${error.message}`);
      logProgress(`❌ Info history fetch failed - tracking disabled: ${error.message}`);
      infoHistoryEnabled = false;
    }
    
    const infoHistoryToCreate: any[] = [];
    
    // Collect alerts for batched notifications at the end
    const commissionRugs: any[] = [];
    const commissionCautions: any[] = [];
    const commissionInfos: any[] = [];
    const mevRugs: any[] = [];
    const mevCautions: any[] = [];

    // 3) Process each validator
    logProgress(`Processing ${allVotes.length} validators...`);
    
    let validatorIndex = 0;
    const totalValidators = allVotes.length;
    for (const v of allVotes) {
      try {
        // Log progress every 200 validators
        if (validatorIndex > 0 && validatorIndex % 200 === 0) {
          const memUsage = process.memoryUsage();
          const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
          logProgress(`Processed ${validatorIndex}/${totalValidators} validators (${memMB}MB heap)...`);
        }
        const meta = infoMap.get(v.nodePubkey) || {};
      const chainName = meta.name;
      const iconUrl = meta.iconUrl;
      const website = meta.website;
      const description = meta.description;
      const version = versionMap.get(v.nodePubkey);

      // Check if validator is delinquent
      const isDelinquent = delinquentSet.has(v.votePubkey);
      
      // Check if validator is Jito-enabled
      const jitoInfo = jitoValidators.get(v.votePubkey);
      const isJitoEnabled = jitoInfo?.isJitoEnabled || false;
      
      // Prepare validator upsert (batch later)
      const existing = existingValidators.get(v.votePubkey);
      const accountCount = stakeAccountCounts.get(v.votePubkey) || 0;
      
      // Get activating/deactivating stake from pre-fetched data
      const stakeData = stakeByVoter.get(v.votePubkey);
      const activatingStake = stakeData?.activating || 0;
      const deactivatingStake = stakeData?.deactivating || 0;
      const activatingAccounts = stakeData?.activatingAccounts || [];
      const deactivatingAccounts = stakeData?.deactivatingAccounts || [];
      
      // Get stake distribution for pie chart (top 25 stakers)
      const distribution = stakeDistribution.get(v.votePubkey);
      const distributionArray: Array<{ staker: string; amount: number; label: string | null }> = [];
      if (distribution) {
        const sorted = Array.from(distribution.entries())
          .sort((a, b) => b[1] - a[1]) // Sort by amount descending
          .slice(0, 25); // Top 25 stakers (frontend will decide how many to show)
        
        for (const [staker, amount] of sorted) {
          distributionArray.push({
            staker,
            amount,
            label: getStakerLabel(staker)
          });
        }
      }
      
      if (existing) {
        // Update existing validator
        const patch: any = {
          votePubkey: v.votePubkey,
          identityPubkey: v.nodePubkey,
          delinquent: isDelinquent,
          commission: v.commission,
          activeStake: Number(v.activatedStake || 0),
          activatingStake,
          deactivatingStake,
          activatingAccounts: activatingAccounts.length > 0 ? JSON.stringify(activatingAccounts) : "[]",
          deactivatingAccounts: deactivatingAccounts.length > 0 ? JSON.stringify(deactivatingAccounts) : "[]",
          jitoEnabled: isJitoEnabled,
          stakeAccountCount: accountCount,
          stakeDistribution: JSON.stringify(distributionArray),
        };
        
        if (chainName) patch.name = chainName;
        
        // Handle iconUrl: update if we have a new one, or clear if existing is DiceBear
        const existingIconUrl = existing.icon_url;
        if (iconUrl) {
          patch.iconUrl = iconUrl;
        } else if (existingIconUrl && existingIconUrl.includes('dicebear.com')) {
          patch.iconUrl = null;
        }
        
        if (website) patch.website = website;
        if (description) patch.description = description;
        if (version) patch.version = version;
        
        validatorsToUpdate.push(patch);
      } else {
        // Create new validator
        validatorsToCreate.push({
          votePubkey: v.votePubkey,
          identityPubkey: v.nodePubkey,
          commission: v.commission,
          delinquent: isDelinquent,
          activeStake: Number(v.activatedStake || 0),
          activatingStake,
          deactivatingStake,
          activatingAccounts: activatingAccounts.length > 0 ? JSON.stringify(activatingAccounts) : "[]",
          deactivatingAccounts: deactivatingAccounts.length > 0 ? JSON.stringify(deactivatingAccounts) : "[]",
          jitoEnabled: isJitoEnabled,
          stakeAccountCount: accountCount,
          stakeDistribution: JSON.stringify(distributionArray),
          firstSeenEpoch: epoch,
          name: chainName || null,
          iconUrl: iconUrl || null,
          website: website || null,
          description: description || null,
          version: version || null,
        });
      }

      // ---- VALIDATOR INFO HISTORY TRACKING ----
      if (infoHistoryEnabled) {
        const lastInfo = lastInfoMap.get(v.votePubkey);
        const currentInfo = {
          identityPubkey: v.nodePubkey,
          name: chainName || null,
          description: description || null,
          website: website || null,
          iconUrl: iconUrl || null,
        };
        
        const normalizedLastInfo = lastInfo ? {
          identityPubkey: lastInfo.identityPubkey || null,
          name: lastInfo.name || null,
          description: lastInfo.description || null,
          website: lastInfo.website || null,
          iconUrl: lastInfo.iconUrl || null,
        } : null;
        
        const hasInfoChanged = !normalizedLastInfo || 
          normalizedLastInfo.identityPubkey !== currentInfo.identityPubkey ||
          normalizedLastInfo.name !== currentInfo.name ||
          normalizedLastInfo.description !== currentInfo.description ||
          normalizedLastInfo.website !== currentInfo.website ||
          normalizedLastInfo.iconUrl !== currentInfo.iconUrl;
        
        if (validatorIndex < 3) {
          console.log(`🔍 Validator ${validatorIndex} (${chainName || v.votePubkey.slice(0, 8)}): hasInfoChanged=${hasInfoChanged}, lastInfo=${!!normalizedLastInfo}`);
        }
        
        if (hasInfoChanged) {
          const timestamp = new Date().toISOString();
          const infoKey = `${v.votePubkey}-${timestamp}`;
          
          infoHistoryToCreate.push({
            key: infoKey,
            votePubkey: v.votePubkey,
            identityPubkey: v.nodePubkey,
            name: currentInfo.name,
            description: currentInfo.description,
            website: currentInfo.website,
            iconUrl: currentInfo.iconUrl,
            changedAt: timestamp,
            epoch,
          });
          
          lastInfoMap.set(v.votePubkey, currentInfo);
        }
      }

      // ---- STAKE HISTORY TRACKING ----
      const stakeKey = `${v.votePubkey}-${epoch}`;
      if (!existingStakeKeys.has(stakeKey) && v.activatedStake !== undefined) {
        stakeRecordsToCreate.push({
          key: stakeKey,
          votePubkey: v.votePubkey,
          epoch,
          activeStake: Number(v.activatedStake || 0),
        });
      }

      // ---- PERFORMANCE HISTORY TRACKING ----
      const blockData = blockProductionData[v.nodePubkey];
      const perfKey = `${v.votePubkey}-${epoch}`;
      
      let skipRate = 0;
      let leaderSlots = 0;
      let blocksProduced = 0;
      
      const scheduleSlots = leaderScheduleData[v.nodePubkey];
      if (scheduleSlots && Array.isArray(scheduleSlots)) {
        leaderSlots = scheduleSlots.length;
      }
      
      const isPumpkinspool = v.votePubkey === '7X7oVvGKhE5HEm1d3vFPmDN5h2HQXqKzfXu1Cz6p8Fk1';
      
      if (blockData) {
        blocksProduced = Number(blockData[1] || 0);
        const elapsedLeaderSlots = Number(blockData[0] || 0);
        
        if (isPumpkinspool) {
          console.log(`\n🎃 PUMPKINSPOOL DEBUG:`);
          console.log(`  Vote pubkey: ${v.votePubkey}`);
          console.log(`  Leader schedule lookup result:`, scheduleSlots ? `${scheduleSlots.length} slots` : 'NOT FOUND');
          console.log(`  Block production data: elapsed=${elapsedLeaderSlots}, produced=${blocksProduced}`);
        }
        
        if (leaderSlots === 0 && elapsedLeaderSlots > 0) {
          leaderSlots = elapsedLeaderSlots;
          console.log(`  ⚠️  ${v.votePubkey.substring(0, 8)}... not in leader schedule, using elapsed: ${leaderSlots}`);
        }
        
        if (elapsedLeaderSlots > 0) {
          skipRate = ((elapsedLeaderSlots - blocksProduced) / elapsedLeaderSlots) * 100;
        }
      }
      
      if (validatorIndex < 3 || isPumpkinspool) {
        console.log(`  Validator ${validatorIndex + 1}: vote=${v.votePubkey.substring(0, 8)}... - leaderSlots=${leaderSlots}, produced=${blocksProduced}, skipRate=${skipRate.toFixed(2)}%`);
      }
        
      const voteCredits = voteCreditsMap.get(v.votePubkey);
      const voteCreditsPercentage = (voteCredits !== undefined && maxVoteCredits > 0)
        ? (voteCredits / maxVoteCredits) * 100
        : 0;
        
      const perfFields = {
        key: perfKey,
        votePubkey: v.votePubkey,
        epoch,
        skipRate: Math.max(0, Math.min(100, skipRate)),
        leaderSlots,
        blocksProduced,
        ...(voteCredits !== undefined ? { 
          voteCredits,
          voteCreditsPercentage: Math.round(voteCreditsPercentage * 100) / 100,
          maxPossibleCredits: maxVoteCredits,
        } : {}),
      };
      
      if (existingPerfKeys.has(perfKey)) {
        perfRecordsToUpdate.push(perfFields);
      } else {
        perfRecordsToCreate.push(perfFields);
      }

      // 4) DELTA-ONLY SNAPSHOTS
      const lastSnapshot = latestCommissionByValidator.get(v.votePubkey);
      const prevCommission = lastSnapshot?.commission;
      const prevEpoch = lastSnapshot?.epoch;

      const hasPrev = prevCommission !== undefined && prevCommission !== null;
      const commissionChanged = !hasPrev || Number(prevCommission) !== v.commission;

      if (commissionChanged) {
        const key = `${v.votePubkey}-${slot}`;
        if (!snapshotsBeingCreated.has(key)) {
          snapshotsBeingCreated.add(key);
          snapshotsToCreate.push({
            key, 
            votePubkey: v.votePubkey, 
            epoch, 
            slot, 
            commission: v.commission
          });
        }

        if (hasPrev) {
          const from = Number(prevCommission);
          const to = Number(v.commission);
          const delta = to - from;

          let type = "INFO";
          let shouldNotify = false;
          
          if (to >= 90 && delta > 0) {
            type = "RUG";
            shouldNotify = true;
          } 
          else if (delta >= 10 && to < 90) {
            type = "CAUTION";
            shouldNotify = true;
          }

          eventsToCreate.push({
            votePubkey: v.votePubkey, 
            epoch, 
            type, 
            fromCommission: from, 
            toCommission: to, 
            delta
          });

          const baseUrl = process.env.BASE_URL || "https://rugalert.pumpkinspool.com";
          const validatorUrl = `${baseUrl}/validator/${v.votePubkey}`;
          const validatorName = chainName || v.votePubkey;
          
          if (type === "RUG") {
            commissionRugs.push({ validatorName, votePubkey: v.votePubkey, from, to, delta, validatorUrl, epoch });
            const msg = `🚨 RUG DETECTED!\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nCommission: ${from}% → ${to}%\nEpoch: ${epoch}\n\nView full details: <${validatorUrl}>`;
            await sendDiscord(msg);
            const twitterMsg = formatTwitterRug(validatorName, v.votePubkey, from, to, delta, validatorUrl);
            await postToTwitter(twitterMsg);
          } else if (type === "CAUTION") {
            commissionCautions.push({ validatorName, votePubkey: v.votePubkey, from, to, delta, validatorUrl, epoch });
            const msg = `⚠️ CAUTION: Large Commission Increase Detected\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nCommission: ${from}% → ${to}% (+${delta}pp)\nEpoch: ${epoch}\n\nView full details: <${validatorUrl}>`;
            await sendDiscord(msg);
            const twitterMsg = formatTwitterRug(validatorName, v.votePubkey, from, to, delta, validatorUrl);
            await postToTwitter(twitterMsg);
          } else if (type === "INFO") {
            commissionInfos.push({ validatorName, votePubkey: v.votePubkey, from, to, delta, validatorUrl, epoch });
          }
        }
      }
      
      // ---- MEV COMMISSION TRACKING ----
      if (isJitoEnabled && jitoInfo) {
        const mevKey = `${v.votePubkey}-${epoch}`;
        
        // Create snapshot if it doesn't exist
        if (!existingMevKeys.has(mevKey)) {
          mevSnapshotsToCreate.push({
            key: mevKey,
            votePubkey: v.votePubkey,
            epoch,
            // Store the value exactly as it comes from Jito API
            // null = no MEV commission (disabled), 0 = staker gets all MEV rewards, 1-100 = validator commission
            mevCommission: jitoInfo.mevCommission,
            priorityFeeCommission: jitoInfo.priorityFeeCommission || 0,
            mevRewards: jitoInfo.mevRewards || 0,
            priorityFeeRewards: jitoInfo.priorityFeeRewards || 0,
          });
          
          if (mevSnapshotsToCreate.length <= 3) {
            console.log(`  Queued MEV snapshot for ${v.votePubkey.substring(0, 8)}... - MEV: ${jitoInfo.mevCommission}%, Priority: ${jitoInfo.priorityFeeCommission || 0}%`);
          }
        }
        
        // ALWAYS check for commission changes, regardless of whether we created a snapshot
        // (snapshot might already exist from a previous run, but we still need to detect changes)
        const latestMev = latestMevByValidator.get(v.votePubkey);
        if (latestMev && latestMev.epoch < epoch) {
          // Only compare if the latest snapshot is from a PREVIOUS epoch
          // Keep NULL as NULL (MEV was disabled), don't convert to 0
          const prevMevCommission = latestMev.mev_commission !== null && latestMev.mev_commission !== undefined
            ? Number(latestMev.mev_commission)
            : null;
          const currentMevCommission = jitoInfo.mevCommission !== null && jitoInfo.mevCommission !== undefined
            ? Number(jitoInfo.mevCommission)
            : null;
          
          // Compare with proper NULL handling
          const changed = (prevMevCommission === null && currentMevCommission !== null) ||
                         (prevMevCommission !== null && currentMevCommission === null) ||
                         (prevMevCommission !== null && currentMevCommission !== null && prevMevCommission !== currentMevCommission);
          
          if (changed) {
            const delta = (currentMevCommission ?? 0) - (prevMevCommission ?? 0);
            const eventType = detectMevRug(prevMevCommission, currentMevCommission);
            
            mevEventsToCreate.push({
              votePubkey: v.votePubkey,
              epoch,
              type: eventType,
              fromMevCommission: prevMevCommission,
              toMevCommission: currentMevCommission,
              delta,
            });
            
            const baseUrl = process.env.BASE_URL || "https://rugalert.pumpkinspool.com";
            const validatorUrl = `${baseUrl}/validator/${v.votePubkey}`;
            const validatorName = chainName || v.votePubkey;
            
            if (eventType === "RUG") {
              // RUG means both values are numbers (not NULL)
              const fromVal = prevMevCommission ?? 0;
              const toVal = currentMevCommission ?? 0;
              mevRugs.push({ validatorName, votePubkey: v.votePubkey, from: fromVal, to: toVal, delta, validatorUrl, epoch });
              const fromStr = prevMevCommission === null ? 'MEV Disabled' : `${prevMevCommission}%`;
              const toStr = currentMevCommission === null ? 'MEV Disabled' : `${currentMevCommission}%`;
              const msg = `🚨 MEV RUG DETECTED!\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nMEV Commission: ${fromStr} → ${toStr}\nEpoch: ${epoch}\n\nView full details: <${validatorUrl}>`;
              await sendDiscord(msg);
              if (prevMevCommission !== null && currentMevCommission !== null) {
                const twitterMsg = formatTwitterMevRug(validatorName, v.votePubkey, prevMevCommission, currentMevCommission, delta, validatorUrl);
                await postToTwitter(twitterMsg);
              }
            } else if (eventType === "CAUTION") {
              const fromVal = prevMevCommission ?? 0;
              const toVal = currentMevCommission ?? 0;
              mevCautions.push({ validatorName, votePubkey: v.votePubkey, from: fromVal, to: toVal, delta, validatorUrl, epoch });
              const fromStr = prevMevCommission === null ? 'MEV Disabled' : `${prevMevCommission}%`;
              const toStr = currentMevCommission === null ? 'MEV Disabled' : `${currentMevCommission}%`;
              const msg = `⚠️ CAUTION: MEV Commission Change Detected\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nMEV Commission: ${fromStr} → ${toStr} (+${delta}pp)\nEpoch: ${epoch}\n\nView full details: <${validatorUrl}>`;
              await sendDiscord(msg);
              if (prevMevCommission !== null && currentMevCommission !== null) {
                const twitterMsg = formatTwitterMevRug(validatorName, v.votePubkey, prevMevCommission, currentMevCommission, delta, validatorUrl);
                await postToTwitter(twitterMsg);
              }
            }
          }
        }
      } else {
        // NOT running Jito now - check if they WERE running it before (MEV disabled event)
        const latestMev = latestMevByValidator.get(v.votePubkey);
        if (latestMev && latestMev.mev_commission !== null && latestMev.mev_commission !== undefined && Number(latestMev.mev_commission) > 0) {
          // They previously had MEV commission > 0, now disabled
          // NOTE: We use NULL (not 0) because:
          // - 0% commission = staker gets ALL MEV rewards (good!)
          // - NULL/disabled = there are NO MEV rewards (bad!)
          const prevMevCommission = Number(latestMev.mev_commission);
          const currentMevCommission = null;
          const delta = -prevMevCommission;
          const eventType = detectMevRug(prevMevCommission, currentMevCommission);
          
          mevEventsToCreate.push({
            votePubkey: v.votePubkey,
            epoch,
            type: eventType,
            fromMevCommission: prevMevCommission,
            toMevCommission: currentMevCommission, // NULL = MEV disabled (not 0 = low commission)
            delta,
          });
          
          // Create snapshot showing MEV is disabled (NULL commission)
          const mevKey = `${v.votePubkey}-${epoch}`;
          if (!existingMevKeys.has(mevKey)) {
            mevSnapshotsToCreate.push({
              key: mevKey,
              votePubkey: v.votePubkey,
              epoch,
              mevCommission: null, // NULL = MEV disabled
              priorityFeeCommission: null,
              mevRewards: 0,
              priorityFeeRewards: 0,
            });
          }
          
          console.log(`  📉 MEV disabled for ${v.votePubkey.substring(0, 8)}... (was ${prevMevCommission}%)`);
        }
      }
      
      } catch (validatorError: any) {
        console.error(`❌ ERROR processing validator ${validatorIndex} (${v.votePubkey.slice(0, 8)}...):`, validatorError);
        logProgress(`❌ Error at validator ${validatorIndex}: ${validatorError.message}`);
      }
    
      validatorIndex++;
    }

    logProgress(`✅ Finished processing all ${validatorIndex} validators`);
    console.log(`📊 Summary: ${validatorsToCreate.length} new, ${validatorsToUpdate.length} updates, ${infoHistoryToCreate.length} info history queued`);
    console.log(`📊 Performance queue: ${perfRecordsToCreate.length} to create, ${perfRecordsToUpdate.length} to update`);
    
    // BATCH CREATE/UPDATE operations
    logProgress(`Batching: ${validatorsToUpdate.length} updates, ${stakeRecordsToCreate.length} stake, ${perfRecordsToCreate.length}+${perfRecordsToUpdate.length} perf`);
    
    // ========== VALIDATOR INFO HISTORY CREATION ==========
    let infoHistoryCreated = 0;
    console.log(`\n📚 ========== VALIDATOR INFO HISTORY CREATION ==========`);
    
    if (infoHistoryEnabled && infoHistoryToCreate.length > 0) {
      try {
        console.log(`🚀 Starting info history creation for ${infoHistoryToCreate.length} records...`);
        logProgress(`Creating ${infoHistoryToCreate.length} validator info history records...`);
        
        for (const record of infoHistoryToCreate) {
          await sql`
            INSERT INTO validator_info_history (key, vote_pubkey, identity_pubkey, name, description, website, icon_url, changed_at, epoch)
            VALUES (
              ${record.key},
              ${record.votePubkey},
              ${record.identityPubkey},
              ${record.name},
              ${record.description},
              ${record.website},
              ${record.iconUrl},
              ${record.changedAt},
              ${record.epoch}
            )
            ON CONFLICT (key) DO NOTHING
          `;
          infoHistoryCreated++;
        }
        
        console.log(`✅✅✅ SUCCESSFULLY CREATED ${infoHistoryCreated} VALIDATOR INFO HISTORY RECORDS ✅✅✅`);
        logProgress(`✅ Created ${infoHistoryCreated} validator info history records`);
      } catch (error: any) {
        console.error(`❌ Validator info history creation failed:`, error.message);
        logProgress(`❌ Info history creation failed: ${error.message}`);
      }
    }
    console.log(`📚 ========== END VALIDATOR INFO HISTORY CREATION ==========\n`);
    
    // Create/update validators
    for (const validator of validatorsToCreate) {
      await sql`
        INSERT INTO validators (
          vote_pubkey, identity_pubkey, name, icon_url, website, description, version,
          commission, active_stake, activating_stake, deactivating_stake,
          activating_accounts, deactivating_accounts, delinquent, jito_enabled,
          stake_account_count, stake_distribution, first_seen_epoch
        ) VALUES (
          ${validator.votePubkey},
          ${validator.identityPubkey},
          ${validator.name},
          ${validator.iconUrl},
          ${validator.website},
          ${validator.description},
          ${validator.version},
          ${validator.commission},
          ${validator.activeStake},
          ${validator.activatingStake},
          ${validator.deactivatingStake},
          ${validator.activatingAccounts},
          ${validator.deactivatingAccounts},
          ${validator.delinquent},
          ${validator.jitoEnabled},
          ${validator.stakeAccountCount},
          ${validator.stakeDistribution},
          ${validator.firstSeenEpoch}
        )
        ON CONFLICT (vote_pubkey) DO NOTHING
      `;
    }
    logProgress(`Created ${validatorsToCreate.length} new validators`);
    
    for (const validator of validatorsToUpdate) {
      await sql`
        UPDATE validators SET
          identity_pubkey = ${validator.identityPubkey},
          name = COALESCE(${validator.name || null}, name),
          icon_url = COALESCE(${validator.iconUrl || null}, icon_url),
          website = COALESCE(${validator.website || null}, website),
          description = COALESCE(${validator.description || null}, description),
          version = COALESCE(${validator.version || null}, version),
          commission = ${validator.commission},
          active_stake = ${validator.activeStake},
          activating_stake = ${validator.activatingStake},
          deactivating_stake = ${validator.deactivatingStake},
          activating_accounts = ${validator.activatingAccounts},
          deactivating_accounts = ${validator.deactivatingAccounts},
          delinquent = ${validator.delinquent},
          jito_enabled = ${validator.jitoEnabled},
          stake_account_count = ${validator.stakeAccountCount},
          stake_distribution = ${validator.stakeDistribution}
        WHERE vote_pubkey = ${validator.votePubkey}
      `;
    }
    logProgress(`Updated ${validatorsToUpdate.length} validators`);
    
    // Create stake records
    for (const stake of stakeRecordsToCreate) {
      await sql`
        INSERT INTO stake_history (key, vote_pubkey, epoch, active_stake)
        VALUES (${stake.key}, ${stake.votePubkey}, ${stake.epoch}, ${stake.activeStake})
        ON CONFLICT (key) DO NOTHING
      `;
      stakeRecordsCreated++;
    }
    if (stakeRecordsCreated > 0) logProgress(`Created ${stakeRecordsCreated} stake records`);
    
    // Create performance records
    for (const perf of perfRecordsToCreate) {
      await sql`
        INSERT INTO performance_history (key, vote_pubkey, epoch, skip_rate, leader_slots, blocks_produced, vote_credits, vote_credits_percentage, max_possible_credits)
        VALUES (
          ${perf.key},
          ${perf.votePubkey},
          ${perf.epoch},
          ${perf.skipRate},
          ${perf.leaderSlots},
          ${perf.blocksProduced},
          ${perf.voteCredits || null},
          ${perf.voteCreditsPercentage || null},
          ${perf.maxPossibleCredits || null}
        )
        ON CONFLICT (key) DO NOTHING
      `;
      performanceRecordsCreated++;
    }
    
    // Update performance records
    for (const perf of perfRecordsToUpdate) {
      await sql`
        UPDATE performance_history SET
          skip_rate = ${perf.skipRate},
          leader_slots = ${perf.leaderSlots},
          blocks_produced = ${perf.blocksProduced},
          vote_credits = ${perf.voteCredits || null},
          vote_credits_percentage = ${perf.voteCreditsPercentage || null},
          max_possible_credits = ${perf.maxPossibleCredits || null}
        WHERE key = ${perf.key}
      `;
      performanceRecordsCreated++;
    }
    logProgress(`Performance: ${perfRecordsToCreate.length} created, ${perfRecordsToUpdate.length} updated`);
    
    // Create commission snapshots
    let snapshotsCreated = 0;
    for (const snapshot of snapshotsToCreate) {
      await sql`
        INSERT INTO snapshots (key, vote_pubkey, epoch, slot, commission)
        VALUES (${snapshot.key}, ${snapshot.votePubkey}, ${snapshot.epoch}, ${snapshot.slot}, ${snapshot.commission})
        ON CONFLICT (key) DO NOTHING
      `;
      snapshotsCreated++;
    }
    if (snapshotsCreated > 0) logProgress(`Created ${snapshotsCreated} commission snapshots`);
    
    // Create events
    let eventsCreated = 0;
    for (const event of eventsToCreate) {
      await sql`
        INSERT INTO events (vote_pubkey, epoch, type, from_commission, to_commission, delta)
        VALUES (${event.votePubkey}, ${event.epoch}, ${event.type}, ${event.fromCommission}, ${event.toCommission}, ${event.delta})
        ON CONFLICT (vote_pubkey, epoch, from_commission, to_commission) DO NOTHING
      `;
      eventsCreated++;
    }
    if (eventsCreated > 0) logProgress(`Created ${eventsCreated} events`);
    
    // Create MEV snapshots
    for (const mev of mevSnapshotsToCreate) {
      await sql`
        INSERT INTO mev_snapshots (key, vote_pubkey, epoch, mev_commission, priority_fee_commission, mev_rewards, priority_fee_rewards)
        VALUES (
          ${mev.key},
          ${mev.votePubkey},
          ${mev.epoch},
          ${mev.mevCommission},
          ${mev.priorityFeeCommission},
          ${mev.mevRewards},
          ${mev.priorityFeeRewards}
        )
        ON CONFLICT (key) DO NOTHING
      `;
    }
    if (mevSnapshotsToCreate.length > 0) logProgress(`Created ${mevSnapshotsToCreate.length} MEV snapshots`);
    
    // Create MEV events
    for (const mevEvent of mevEventsToCreate) {
      // Use INSERT with WHERE NOT EXISTS to handle partial unique indexes
      // (ON CONFLICT doesn't work with partial indexes in PostgreSQL)
      await sql`
        INSERT INTO mev_events (vote_pubkey, epoch, type, from_mev_commission, to_mev_commission, delta)
        SELECT 
          ${mevEvent.votePubkey},
          ${mevEvent.epoch},
          ${mevEvent.type},
          ${mevEvent.fromMevCommission},
          ${mevEvent.toMevCommission},
          ${mevEvent.delta}
        WHERE NOT EXISTS (
          SELECT 1 FROM mev_events
          WHERE vote_pubkey = ${mevEvent.votePubkey}
            AND epoch = ${mevEvent.epoch}
            AND from_mev_commission IS NOT DISTINCT FROM ${mevEvent.fromMevCommission}
            AND to_mev_commission IS NOT DISTINCT FROM ${mevEvent.toMevCommission}
        )
      `;
    }
    if (mevEventsToCreate.length > 0) logProgress(`Created ${mevEventsToCreate.length} MEV events`);
    
    console.log(`\n🎉 ========== SNAPSHOT DATA COLLECTION COMPLETE ==========`);
    console.log(`✅ Stake records created: ${stakeRecordsCreated}`);
    console.log(`✅ Performance records created: ${performanceRecordsCreated}`);
    console.log(`✅ Commission snapshots created: ${snapshotsCreated}`);
    console.log(`✅ Events created: ${eventsCreated}`);
    console.log(`✅ MEV snapshots created: ${mevSnapshotsToCreate.length}`);
    console.log(`✅ MEV events created: ${mevEventsToCreate.length}`);
    console.log(`📚 Validator info history records: ${infoHistoryCreated}`);
    logProgress(`✅ Main snapshot complete! Starting cleanup...`);
    
    // Cleanup: Delete performance records older than 15 epochs
    const oldestEpochToKeep = epoch - 15;
    console.log(`🧹 Cleaning up performance records older than epoch ${oldestEpochToKeep}...`);
    
    try {
      const result = await sql`
        DELETE FROM performance_history
        WHERE epoch < ${oldestEpochToKeep}
        AND id IN (
          SELECT id FROM performance_history
          WHERE epoch < ${oldestEpochToKeep}
          LIMIT 1000
        )
      `;
      console.log(`🗑️  Deleted old performance records`);
    } catch (cleanupErr) {
      console.error(`⚠️  Cleanup error (non-fatal):`, cleanupErr);
    }
    
    console.log(`\n🎉 ========== SNAPSHOT JOB COMPLETED SUCCESSFULLY ==========`);
    
    // Send batched digest emails
    console.log(`\n📧 ========== SENDING BATCHED ALERT EMAILS ==========`);
    logProgress(`Sending batched alert emails...`);
    
    const totalAlerts = commissionRugs.length + commissionCautions.length + mevRugs.length + mevCautions.length;
    console.log(`📊 Alert summary: ${commissionRugs.length} commission rugs, ${commissionCautions.length} commission cautions, ${mevRugs.length} MEV rugs, ${mevCautions.length} MEV cautions`);
    
    if (totalAlerts > 0) {
      try {
        let digestSubject = "";
        let digestBody = "";
        
        if (commissionRugs.length > 0 || mevRugs.length > 0) {
          digestSubject = `🚨 ${commissionRugs.length + mevRugs.length} Validator Rug${commissionRugs.length + mevRugs.length > 1 ? 's' : ''} Detected (Epoch ${epoch})`;
        } else {
          digestSubject = `⚠️ ${totalAlerts} Validator Commission Increase${totalAlerts > 1 ? 's' : ''} Detected (Epoch ${epoch})`;
        }
        
        digestBody = `Validator Alert Digest - Epoch ${epoch}\n\n`;
        
        if (commissionRugs.length > 0) {
          digestBody += `🚨 COMMISSION RUGS (${commissionRugs.length}):\n`;
          for (const rug of commissionRugs) {
            digestBody += `\n• ${rug.validatorName}\n`;
            digestBody += `  Vote Pubkey: ${rug.votePubkey}\n`;
            digestBody += `  Commission: ${rug.from}% → ${rug.to}% (${rug.delta >= 0 ? '+' : ''}${rug.delta}pp)\n`;
            digestBody += `  View: <${rug.validatorUrl}>\n`;
          }
          digestBody += `\n`;
        }
        
        if (mevRugs.length > 0) {
          digestBody += `🚨 MEV COMMISSION RUGS (${mevRugs.length}):\n`;
          for (const rug of mevRugs) {
            digestBody += `\n• ${rug.validatorName}\n`;
            digestBody += `  Vote Pubkey: ${rug.votePubkey}\n`;
            digestBody += `  MEV Commission: ${rug.from}% → ${rug.to}% (${rug.delta >= 0 ? '+' : ''}${rug.delta}pp)\n`;
            digestBody += `  View: <${rug.validatorUrl}>\n`;
          }
          digestBody += `\n`;
        }
        
        if (commissionCautions.length > 0) {
          digestBody += `⚠️ COMMISSION INCREASES (${commissionCautions.length}):\n`;
          for (const caution of commissionCautions) {
            digestBody += `\n• ${caution.validatorName}\n`;
            digestBody += `  Commission: ${caution.from}% → ${caution.to}% (+${caution.delta}pp)\n`;
            digestBody += `  View: <${caution.validatorUrl}>\n`;
          }
          digestBody += `\n`;
        }
        
        if (mevCautions.length > 0) {
          digestBody += `⚠️ MEV COMMISSION INCREASES (${mevCautions.length}):\n`;
          for (const caution of mevCautions) {
            digestBody += `\n• ${caution.validatorName}\n`;
            digestBody += `  MEV Commission: ${caution.from}% → ${caution.to}% (+${caution.delta}pp)\n`;
            digestBody += `  View: <${caution.validatorUrl}>\n`;
          }
        }
        
        await sendEmail(digestSubject, digestBody, commissionRugs.length + mevRugs.length > 0 ? "RUG" : "CAUTION");
        console.log(`✅ Sent digest email with ${totalAlerts} alerts`);
        logProgress(`✅ Sent digest email with ${totalAlerts} alerts`);
      } catch (emailError: any) {
        console.error(`❌ Failed to send digest email:`, emailError.message);
        logProgress(`⚠️ Digest email failed: ${emailError.message}`);
      }
    } else {
      console.log(`ℹ️ No alerts to send`);
    }
    
    // Send batched INFO emails
    if (commissionInfos.length > 0) {
      try {
        const infoSubject = `📊 ${commissionInfos.length} Validator Commission Change${commissionInfos.length > 1 ? 's' : ''} (Epoch ${epoch})`;
        let infoBody = `Validator Commission Changes - Epoch ${epoch}\n\n`;
        
        for (const info of commissionInfos) {
          infoBody += `• ${info.validatorName}\n`;
          infoBody += `  Commission: ${info.from}% → ${info.to}% (${info.delta >= 0 ? '+' : ''}${info.delta}pp)\n`;
          infoBody += `  View: <${info.validatorUrl}>\n\n`;
        }
        
        await sendEmail(infoSubject, infoBody, "INFO");
        console.log(`✅ Sent batched INFO email with ${commissionInfos.length} changes`);
        logProgress(`✅ Sent batched INFO email with ${commissionInfos.length} changes`);
      } catch (emailError: any) {
        console.error(`❌ Failed to send INFO digest email:`, emailError.message);
        logProgress(`⚠️ INFO digest email failed: ${emailError.message}`);
      }
    }
    
    console.log(`📧 ========== END BATCHED EMAIL SENDING ==========\n`);
    
    logProgress(`✅ Snapshot complete!`);
    
    // Log job success
    const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
    await sql`
      UPDATE job_runs
      SET status = 'success',
          completed_at = NOW(),
          epoch = ${epoch},
          duration_seconds = ${durationSeconds},
          metrics = ${JSON.stringify({
            stakeRecordsCreated,
            performanceRecordsCreated,
            snapshotsCreated,
            eventsCreated,
            mevSnapshotsCreated: mevSnapshotsToCreate.length,
            mevEventsCreated: mevEventsToCreate.length,
            infoHistoryCreated,
            alertsDetected: totalAlerts,
          })}
      WHERE id = ${jobRunId}
    `;
    
    return NextResponse.json({ 
      ok: true, 
      epoch, 
      slot,
      jobRunId,
      metrics: {
        stakeRecordsCreated,
        performanceRecordsCreated,
        snapshotsCreated,
        eventsCreated,
        mevSnapshotsCreated: mevSnapshotsToCreate.length,
        mevEventsCreated: mevEventsToCreate.length,
        infoHistoryCreated,
        alertsDetected: totalAlerts,
      }
    });
  } catch (err: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ [${elapsed}s] Snapshot error:`, err.message || err);
    console.error("Stack trace:", err.stack);
    
    // Log job failure
    try {
      await sql`
        UPDATE job_runs
        SET status = 'failed',
            completed_at = NOW(),
            duration_seconds = ${Math.floor((Date.now() - startTime) / 1000)},
            error_message = ${String(err?.message || err)}
        WHERE id = ${jobRunId}
      `;
    } catch (logErr) {
      console.error("Failed to log job failure:", logErr);
    }
    
    // TODO: Set up proper monitoring
    // Options:
    // 1. BetterUptime monitoring /api/snapshot-health endpoint
    // 2. Separate Discord webhook for ops alerts (DISCORD_OPS_WEBHOOK_URL)
    // 3. PagerDuty/Slack integration
    
    return NextResponse.json({ 
      error: String(err?.message || err),
      elapsed: `${elapsed}s`,
      hint: "Check logs and /api/snapshot-health for diagnosis",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

