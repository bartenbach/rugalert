import { NextRequest, NextResponse } from "next/server";
import { tb } from "../../../lib/airtable";
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
    
    const subs = await tb.subs.select().firstPage();
    console.log(`📧 Found ${subs.length} total subscribers`);
    
    // Filter subscribers based on their preferences
    const eligibleSubs = subs.filter((s) => {
      const email = s.get("email");
      if (!email) return false;
      
      const prefs = s.get("preferences") as string | undefined;
      const preference = prefs || "rugs_only"; // Default to rugs_only
      
      console.log(`  Subscriber: ${email}, preference: ${preference}, eventType: ${eventType}`);
      
      // Determine if this subscriber should get this type of alert
      if (preference === "all") return true; // All events
      if (preference === "rugs_and_cautions" && (eventType === "RUG" || eventType === "CAUTION")) return true;
      if (preference === "rugs_only" && eventType === "RUG") return true;
      
      return false;
    });
    
    const emails = eligibleSubs.map((s) => String(s.get("email"))).filter(Boolean);
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
        
        // Debug: Show some examples of activating/deactivating stake
        let exampleCount = 0;
        for (const [voter, data] of stakeByVoter.entries()) {
          if ((data.activating > 0 || data.deactivating > 0) && exampleCount < 3) {
            console.log(`  Example: ${voter.substring(0, 8)}... - Activating: ${(data.activating / 1_000_000_000).toFixed(2)} SOL, Deactivating: ${(data.deactivating / 1_000_000_000).toFixed(2)} SOL`);
            exampleCount++;
          }
        }
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
    const allValidators: any[] = [];
    await tb.validators.select({ pageSize: 100 }).eachPage((records, fetchNextPage) => {
      allValidators.push(...records);
      fetchNextPage();
    });
    allValidators.forEach(v => existingValidators.set(String(v.get('votePubkey')), v));
    
    // Fetch existing stake records for this epoch
    const existingStakeKeys = new Set<string>();
    await tb.stakeHistory.select({
      filterByFormula: `{epoch} = ${epoch}`,
      pageSize: 100
    }).eachPage((records, fetchNextPage) => {
      records.forEach(r => existingStakeKeys.add(String(r.get('key'))));
      fetchNextPage();
    });
    
    // Fetch existing performance records for this epoch
    const existingPerfKeys = new Set<string>();
    const existingPerfRecords = new Map<string, any>();
    await tb.performanceHistory.select({
      filterByFormula: `{epoch} = ${epoch}`,
      pageSize: 100
    }).eachPage((records, fetchNextPage) => {
      records.forEach(r => {
        const key = String(r.get('key'));
        existingPerfKeys.add(key);
        existingPerfRecords.set(key, r);
      });
      fetchNextPage();
    });
    
    // Fetch existing MEV snapshots for this epoch
    const existingMevKeys = new Set<string>();
    await tb.mevSnapshots.select({
      filterByFormula: `{epoch} = ${epoch}`,
      pageSize: 100
    }).eachPage((records, fetchNextPage) => {
      records.forEach(r => existingMevKeys.add(String(r.get('key'))));
      fetchNextPage();
    });
    
    // Fetch latest MEV snapshot per validator (for change detection)
    const latestMevByValidator = new Map<string, any>();
    await tb.mevSnapshots.select({
      pageSize: 100,
      sort: [{ field: 'epoch', direction: 'desc' }],
      maxRecords: 2000,
    }).eachPage((records, fetchNextPage) => {
      records.forEach(r => {
        const votePubkey = String(r.get('votePubkey'));
        if (!latestMevByValidator.has(votePubkey)) {
          latestMevByValidator.set(votePubkey, r);
        }
      });
      fetchNextPage();
    });
    
    // Fetch latest commission snapshot per validator (for change detection)
    // THIS MUST BE PRE-FETCHED! Doing this inside the loop = 970 individual queries = death
    logProgress(`Pre-fetching latest commission snapshots...`);
    const latestCommissionByValidator = new Map<string, { commission: number, epoch: number, slot: number }>();
    await tb.snapshots.select({
      pageSize: 100,
      sort: [{ field: 'slot', direction: 'desc' }],
      maxRecords: 2000,
    }).eachPage((records, fetchNextPage) => {
      records.forEach(r => {
        const votePubkey = String(r.get('votePubkey'));
        if (!latestCommissionByValidator.has(votePubkey)) {
          latestCommissionByValidator.set(votePubkey, {
            commission: Number(r.get('commission') || 0),
            epoch: Number(r.get('epoch') || 0),
            slot: Number(r.get('slot') || 0),
          });
        }
      });
      fetchNextPage();
    });
    
    logProgress(`Pre-fetch complete: ${existingValidators.size} validators, ${existingStakeKeys.size} stake, ${existingPerfKeys.size} perf, ${existingMevKeys.size} MEV, ${latestCommissionByValidator.size} commission`);
    
    // Batch arrays for bulk creation
    const validatorsToCreate: any[] = [];
    const validatorsToUpdate: {id: string, fields: any}[] = [];
    const stakeRecordsToCreate: any[] = [];
    const perfRecordsToCreate: any[] = [];
    const perfRecordsToUpdate: {id: string, fields: any}[] = [];
    const mevSnapshotsToCreate: any[] = [];
    const mevEventsToCreate: any[] = [];
    const snapshotsToCreate: any[] = [];
    const eventsToCreate: any[] = [];
    
    // Track snapshots we're creating in this run to avoid duplicates
    const snapshotsBeingCreated = new Set<string>();

    // 2) jsonParsed GPA over Config program (validatorInfo records)
    const gpa = await rpc("getProgramAccounts", [
      "Config1111111111111111111111111111111111111",
      { encoding: "jsonParsed", commitment: "confirmed" },
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
    // Using null instead of undefined for consistency with Airtable
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
      
      const allInfoHistory = await tb.validatorInfoHistory.select({
        sort: [{ field: 'changedAt', direction: 'desc' }],
        pageSize: 100,
      }).all();
      
      console.log(`✅ Successfully fetched ${allInfoHistory.length} info history records from Airtable`);
      logProgress(`Loaded ${allInfoHistory.length} info history records, processing...`);
      
      for (const record of allInfoHistory) {
        const votePubkey = record.get('votePubkey') as string;
        if (!lastInfoMap.has(votePubkey)) {
          // Normalize values from Airtable - convert any falsy value to null
          // Empty strings are already filtered at source, so || is safe here
          lastInfoMap.set(votePubkey, {
            identityPubkey: (record.get('identityPubkey') as string | undefined) || null,
            name: (record.get('name') as string | undefined) || null,
            description: (record.get('description') as string | undefined) || null,
            website: (record.get('website') as string | undefined) || null,
            iconUrl: (record.get('iconUrl') as string | undefined) || null,
          });
        }
      }
      console.log(`✅ Built info history map for ${lastInfoMap.size} validators`);
      logProgress(`Processed ${lastInfoMap.size} unique validator info records`);
    } catch (error: any) {
      console.error(`❌ VALIDATOR INFO HISTORY TABLE FETCH FAILED!`);
      console.error(`Error type: ${error.constructor.name}`);
      console.error(`Error message: ${error.message}`);
      console.error(`Full error:`, error);
      if (error.statusCode) console.error(`Status code: ${error.statusCode}`);
      logProgress(`❌ Info history fetch failed - tracking disabled: ${error.message}`);
      infoHistoryEnabled = false;
    }
    
    const infoHistoryToCreate: any[] = [];

    // 3) Process each validator
    logProgress(`Processing ${allVotes.length} validators...`);
    console.log(`🔄 Starting validator loop: ${allVotes.length} total validators`);
    let validatorIndex = 0;
    const totalValidators = allVotes.length;
    for (const v of allVotes) {
      // Log progress every 50 validators (more frequent) and show memory
      if (validatorIndex > 0 && validatorIndex % 50 === 0) {
        const memUsage = process.memoryUsage();
        const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        logProgress(`Processed ${validatorIndex}/${totalValidators} validators (${memMB}MB heap)...`);
        console.log(`  💾 Memory: ${memMB}MB heap, ${Math.round(memUsage.rss / 1024 / 1024)}MB RSS`);
      }
      const meta = infoMap.get(v.nodePubkey) || {};
      const chainName = meta.name;
      // No fallback icon - let validators with no icon show empty square
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
      
      // Get stake distribution for pie chart (top 10 + "Others")
      const distribution = stakeDistribution.get(v.votePubkey);
      const distributionArray: Array<{ staker: string; amount: number; label: string | null }> = [];
      if (distribution) {
        const sorted = Array.from(distribution.entries())
          .sort((a, b) => b[1] - a[1]) // Sort by amount descending
          .slice(0, 10); // Top 10 stakers
        
        for (const [staker, amount] of sorted) {
          distributionArray.push({
            staker,
            amount,
            label: getStakerLabel(staker)
          });
        }
      }
      
      if (existing) {
        const patch: any = {};
        if (existing.get("identityPubkey") !== v.nodePubkey)
          patch.identityPubkey = v.nodePubkey;
        if (chainName) patch.name = chainName;
        
        // Handle iconUrl: update if we have a new one, or clear if existing is DiceBear
        const existingIconUrl = existing.get("iconUrl") as string | undefined;
        if (iconUrl) {
          patch.iconUrl = iconUrl;
        } else if (existingIconUrl && existingIconUrl.includes('dicebear.com')) {
          // Clear DiceBear fallback URLs
          patch.iconUrl = null;
        }
        
        if (website)   patch.website = website;
        if (description) patch.description = description;
        if (version && existing.get("version") !== version) patch.version = version;
        // Update delinquent status (changes frequently)
        patch.delinquent = isDelinquent;
        // Cache current commission for fast access
        patch.commission = v.commission;
        // Cache activeStake (locked at epoch boundaries)
        patch.activeStake = Number(v.activatedStake || 0);
        // Cache activating/deactivating stake (ephemeral current state, not historical)
        patch.activatingStake = activatingStake;
        patch.deactivatingStake = deactivatingStake;
        // Store stake account breakdowns as JSON for detailed UI display
        patch.activatingAccounts = JSON.stringify(activatingAccounts);
        patch.deactivatingAccounts = JSON.stringify(deactivatingAccounts);
        // Update Jito status
        patch.jitoEnabled = isJitoEnabled;
        // Update stake account count
        patch.stakeAccountCount = accountCount;
        // Update stake distribution (for pie chart)
        patch.stakeDistribution = JSON.stringify(distributionArray);
        if (Object.keys(patch).length) {
          validatorsToUpdate.push({ id: existing.id, fields: patch });
        }
      } else {
        validatorsToCreate.push({
          fields: {
            votePubkey: v.votePubkey,
            identityPubkey: v.nodePubkey,
            commission: v.commission,
            delinquent: isDelinquent,
            activeStake: Number(v.activatedStake || 0),
            activatingStake,
            deactivatingStake,
            activatingAccounts: JSON.stringify(activatingAccounts),
            deactivatingAccounts: JSON.stringify(deactivatingAccounts),
            jitoEnabled: isJitoEnabled,
            stakeAccountCount: accountCount,
            stakeDistribution: JSON.stringify(distributionArray),
            firstSeenEpoch: epoch, // Track when validator first appeared
            ...(chainName ? { name: chainName } : {}),
            ...(iconUrl   ? { iconUrl } : {}),
            ...(website   ? { website } : {}),
            ...(description ? { description } : {}),
            ...(version ? { version } : {}),
          }
        });
      }

      // ---- VALIDATOR INFO HISTORY TRACKING ----
      // Only track if table exists and is enabled
      if (infoHistoryEnabled) {
        // Check if validator info has changed since last snapshot
        const lastInfo = lastInfoMap.get(v.votePubkey);
        // Normalize undefined/null to null for consistent comparison
        const currentInfo = {
          identityPubkey: v.nodePubkey,
          name: chainName || null,
          description: description || null,
          website: website || null,
          iconUrl: iconUrl || null,
        };
        
        // Also normalize lastInfo values (Airtable might return undefined or null)
        const normalizedLastInfo = lastInfo ? {
          identityPubkey: lastInfo.identityPubkey || null,
          name: lastInfo.name || null,
          description: lastInfo.description || null,
          website: lastInfo.website || null,
          iconUrl: lastInfo.iconUrl || null,
        } : null;
        
        // Detect changes in any tracked field
        const hasInfoChanged = !normalizedLastInfo || 
          normalizedLastInfo.identityPubkey !== currentInfo.identityPubkey ||
          normalizedLastInfo.name !== currentInfo.name ||
          normalizedLastInfo.description !== currentInfo.description ||
          normalizedLastInfo.website !== currentInfo.website ||
          normalizedLastInfo.iconUrl !== currentInfo.iconUrl;
        
        // Debug logging for first few validators AND when changes detected
        if (validatorIndex < 5 || hasInfoChanged) {
          console.log(`🔍 Validator ${validatorIndex} (${chainName || v.votePubkey.slice(0, 8)}): hasInfoChanged=${hasInfoChanged}, lastInfo=${!!normalizedLastInfo}, name=${!!chainName}, website=${!!website}, iconUrl=${!!iconUrl}`);
        }
        
        if (hasInfoChanged) {
          const timestamp = new Date().toISOString();
          const infoKey = `${v.votePubkey}-${timestamp}`;
          
          infoHistoryToCreate.push({
            fields: {
              key: infoKey,
              votePubkey: v.votePubkey,
              identityPubkey: v.nodePubkey,
              name: currentInfo.name,
              description: currentInfo.description,
              website: currentInfo.website,
              iconUrl: currentInfo.iconUrl,
              changedAt: timestamp,
              epoch,
            }
          });
          
          // Update our map for subsequent checks in this snapshot run
          lastInfoMap.set(v.votePubkey, currentInfo);
          
          // Log the change (helpful for debugging)
          if (normalizedLastInfo) {
            console.log(`📝 Info changed for ${chainName || v.votePubkey.slice(0, 8)}:`);
            if (normalizedLastInfo.identityPubkey !== currentInfo.identityPubkey) 
              console.log(`  Identity: ${normalizedLastInfo.identityPubkey} → ${currentInfo.identityPubkey}`);
            if (normalizedLastInfo.name !== currentInfo.name) 
              console.log(`  Name: ${normalizedLastInfo.name || '(none)'} → ${currentInfo.name || '(none)'}`);
            if (normalizedLastInfo.description !== currentInfo.description) 
              console.log(`  Description changed`);
            if (normalizedLastInfo.website !== currentInfo.website) 
              console.log(`  Website: ${normalizedLastInfo.website || '(none)'} → ${currentInfo.website || '(none)'}`);
            if (normalizedLastInfo.iconUrl !== currentInfo.iconUrl) 
              console.log(`  Icon URL changed`);
          } else {
            console.log(`🆕 First snapshot for ${chainName || v.votePubkey.slice(0, 8)}`);
          }
        }
      }

      // ---- STAKE HISTORY TRACKING ----
      // Only track ACTUAL historical stake (active stake at epoch boundaries)
      // activating/deactivating are cached in validators table as current state
      const stakeKey = `${v.votePubkey}-${epoch}`;
      if (!existingStakeKeys.has(stakeKey) && v.activatedStake !== undefined) {
        stakeRecordsToCreate.push({
          fields: {
            key: stakeKey,
            votePubkey: v.votePubkey,
            epoch,
            activeStake: Number(v.activatedStake || 0),
          }
        });
      }

      // ---- PERFORMANCE HISTORY TRACKING ----
      const blockData = blockProductionData[v.nodePubkey];
      const perfKey = `${v.votePubkey}-${epoch}`;
      
        let skipRate = 0;
      let leaderSlots = 0;
      let blocksProduced = 0;
        if (blockData) {
        leaderSlots = Number(blockData[0] || 0);
        blocksProduced = Number(blockData[1] || 0);
          
          if (leaderSlots > 0) {
            skipRate = ((leaderSlots - blocksProduced) / leaderSlots) * 100;
          }
        }
        
        // Get vote credits from pre-fetched map and calculate percentage
        const voteCredits = voteCreditsMap.get(v.votePubkey);
        const voteCreditsPercentage = (voteCredits !== undefined && maxVoteCredits > 0)
          ? (voteCredits / maxVoteCredits) * 100
          : 0;
        
      const perfFields = {
            key: perfKey,
            votePubkey: v.votePubkey,
            epoch,
            skipRate: Math.max(0, Math.min(100, skipRate)),
        leaderSlots, // Store total leader slots for calculating skipped blocks in UI
        blocksProduced, // Store actual blocks produced
            ...(voteCredits !== undefined ? { 
              voteCredits,
              voteCreditsPercentage: Math.round(voteCreditsPercentage * 100) / 100, // 2 decimal places
              maxPossibleCredits: maxVoteCredits,
            } : {}),
      };
      
      // For current epoch: update existing record, otherwise create new
      if (existingPerfKeys.has(perfKey)) {
        // Update the existing record
        const existingRecord = existingPerfRecords.get(perfKey);
        if (existingRecord) {
          perfRecordsToUpdate.push({
            id: existingRecord.id,
            fields: perfFields
          });
        }
      } else {
        perfRecordsToCreate.push({
          fields: perfFields
        });
      }

      // 4) DELTA-ONLY SNAPSHOTS
      // Get the most recent snapshot for this validator (from pre-fetched map)
      const lastSnapshot = latestCommissionByValidator.get(v.votePubkey);
      const prevCommission = lastSnapshot?.commission;
      const prevEpoch = lastSnapshot?.epoch;

      // Only write a new snapshot if commission changed since the most recent snapshot,
      // OR if there is no previous snapshot at all.
      const hasPrev = prevCommission !== undefined && prevCommission !== null;
      const commissionChanged = !hasPrev || Number(prevCommission) !== v.commission;

      if (commissionChanged) {
        // Queue snapshot for batch creation (check for duplicates)
        const key = `${v.votePubkey}-${slot}`;
        if (!snapshotsBeingCreated.has(key)) {
          snapshotsBeingCreated.add(key);
          snapshotsToCreate.push({
            fields: { key, votePubkey: v.votePubkey, epoch, slot, commission: v.commission }
          });
        }

        // Event detection against the last snapshot (if it existed)
        if (hasPrev) {
          const from = Number(prevCommission);
          const to = Number(v.commission);
          const delta = to - from;

          // Create events for ALL commission changes
          let type = "INFO";
          let shouldNotify = false;
          
          // RUG: Commission increased TO 90% or higher (taking almost all rewards)
          if (to >= 90 && delta > 0) {
            type = "RUG";
            shouldNotify = true;
          } 
          // CAUTION: Commission increased by 10+ percentage points (but not to rug levels)
          else if (delta >= 10 && to < 90) {
            type = "CAUTION";
            shouldNotify = true;
          }
          // INFO: All other changes (small increases, decreases, etc.)

          // Queue event for batch creation
          eventsToCreate.push({
            fields: { votePubkey: v.votePubkey, epoch, type, fromCommission: from, toCommission: to, delta }
          });

          // Send notifications based on event type
          const baseUrl = process.env.BASE_URL || "https://rugalert.pumpkinspool.com";
          const validatorUrl = `${baseUrl}/validator/${v.votePubkey}`;
          const validatorName = chainName || v.votePubkey;
          
          if (type === "RUG") {
            const msg = `🚨 RUG DETECTED!\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nCommission: ${from}% → ${to}%\nEpoch: ${epoch}\n\nView full details: <${validatorUrl}>`;
            await sendDiscord(msg);
            await sendEmail("🚨 Solana Validator Commission Rug Detected", msg, "RUG");
            // Post to Twitter/X for community retweets
            const twitterMsg = formatTwitterRug(validatorName, v.votePubkey, from, to, delta, validatorUrl);
            await postToTwitter(twitterMsg);
          } else if (type === "CAUTION") {
            const msg = `⚠️ CAUTION: Large Commission Increase Detected\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nCommission: ${from}% → ${to}% (+${delta}pp)\nEpoch: ${epoch}\n\nView full details: <${validatorUrl}>`;
            await sendDiscord(msg);
            await sendEmail("⚠️ Solana Validator Large Commission Jump Detected", msg, "CAUTION");
            // Optionally post CAUTION to Twitter too (remove if too noisy)
            const twitterMsg = formatTwitterRug(validatorName, v.votePubkey, from, to, delta, validatorUrl);
            await postToTwitter(twitterMsg);
          } else if (type === "INFO") {
            const msg = `📊 Commission Change\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nCommission: ${from}% → ${to}%\nEpoch: ${epoch}\n\nView full details: <${validatorUrl}>`;
            await sendEmail("📊 Solana Validator Commission Change", msg, "INFO");
          }
        }
      }
      // If commission didn't change, we write nothing and (correctly) emit no event.
      
      // ---- MEV COMMISSION TRACKING ----
      if (isJitoEnabled && jitoInfo) {
        const mevKey = `${v.votePubkey}-${epoch}`;
        
        // Only create snapshot if we don't have one for this epoch
        if (!existingMevKeys.has(mevKey)) {
            mevSnapshotsToCreate.push({
              fields: {
                key: mevKey,
                votePubkey: v.votePubkey,
                epoch,
                mevCommission: jitoInfo.mevCommission || 0,
                priorityFeeCommission: jitoInfo.priorityFeeCommission || 0,
                mevRewards: jitoInfo.mevRewards || 0,
                priorityFeeRewards: jitoInfo.priorityFeeRewards || 0,
              }
            });
          
          // Debug: Log first few MEV snapshots
          if (mevSnapshotsToCreate.length <= 3) {
            console.log(`  Queued MEV snapshot for ${v.votePubkey.substring(0, 8)}... - MEV: ${jitoInfo.mevCommission}%, Priority: ${jitoInfo.priorityFeeCommission || 0}%`);
          }
          
          // Check for MEV commission changes
          const latestMev = latestMevByValidator.get(v.votePubkey);
          if (latestMev) {
            const prevMevCommission = Number(latestMev.get('mevCommission') || 0);
            const currentMevCommission = jitoInfo.mevCommission || 0;
            
            // Only create event if MEV commission actually changed
            if (prevMevCommission !== currentMevCommission) {
              const delta = currentMevCommission - prevMevCommission;
              const eventType = detectMevRug(prevMevCommission, currentMevCommission);
              
              mevEventsToCreate.push({
                fields: {
                  votePubkey: v.votePubkey,
                  epoch,
                  type: eventType,
                  fromMevCommission: prevMevCommission,
                  toMevCommission: currentMevCommission,
                  delta,
                }
              });
              
              // Send notifications for MEV rugs
              const baseUrl = process.env.BASE_URL || "https://rugalert.pumpkinspool.com";
              const validatorUrl = `${baseUrl}/validator/${v.votePubkey}`;
              const validatorName = chainName || v.votePubkey;
              
              if (eventType === "RUG") {
                const msg = `🚨 MEV RUG DETECTED!\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nMEV Commission: ${prevMevCommission}% → ${currentMevCommission}%\nEpoch: ${epoch}\n\nView full details: <${validatorUrl}>`;
                await sendDiscord(msg);
                await sendEmail("🚨 Solana Validator MEV Commission Rug Detected", msg, "RUG");
                // Post MEV rug to Twitter/X
                const twitterMsg = formatTwitterMevRug(validatorName, v.votePubkey, prevMevCommission, currentMevCommission, delta, validatorUrl);
                await postToTwitter(twitterMsg);
              } else if (eventType === "CAUTION") {
                const msg = `⚠️ CAUTION: Large MEV Commission Increase Detected\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nMEV Commission: ${prevMevCommission}% → ${currentMevCommission}% (+${delta}pp)\nEpoch: ${epoch}\n\nView full details: <${validatorUrl}>`;
                await sendDiscord(msg);
                await sendEmail("⚠️ Solana Validator MEV Commission Increase", msg, "CAUTION");
                // Optionally post MEV CAUTION to Twitter too
                const twitterMsg = formatTwitterMevRug(validatorName, v.votePubkey, prevMevCommission, currentMevCommission, delta, validatorUrl);
                await postToTwitter(twitterMsg);
              }
            }
          }
        }
      }
    
    validatorIndex++; // Increment counter for next validator
    }

    console.log(`🏁 LOOP COMPLETED! Processed ${validatorIndex} validators`);
    logProgress(`✅ Finished processing all ${validatorIndex} validators`);
    console.log(`📊 Summary: ${validatorsToCreate.length} new, ${validatorsToUpdate.length} updates, ${infoHistoryToCreate.length} info history records queued`);
    console.log(`📊 INFO HISTORY DEBUG: enabled=${infoHistoryEnabled}, lastInfoMapSize=${lastInfoMap.size}, recordsQueued=${infoHistoryToCreate.length}`);
    if (infoHistoryToCreate.length > 0) {
      console.log(`📊 INFO HISTORY SAMPLE:`, JSON.stringify(infoHistoryToCreate[0], null, 2));
    } else if (infoHistoryEnabled) {
      console.log(`⚠️ INFO HISTORY: Table enabled but NO records queued! This means no validator info changed.`);
    }
    console.log(`📊 Breakdown: ${stakeRecordsToCreate.length} stake, ${perfRecordsToCreate.length} perf create, ${perfRecordsToUpdate.length} perf update, ${mevSnapshotsToCreate.length} MEV, ${mevEventsToCreate.length} MEV events`);

    // BATCH CREATE/UPDATE operations to avoid timeout
    console.log(`📦 Batching operations: ${validatorsToCreate.length} new validators, ${validatorsToUpdate.length} validator updates`);
    logProgress(`Batching: ${validatorsToCreate.length} new validators, ${validatorsToUpdate.length} updates, ${stakeRecordsToCreate.length} stake, ${perfRecordsToCreate.length}+${perfRecordsToUpdate.length} perf`);
    
    // Airtable allows max 10 records per create/update call, so batch them
    const batchSize = 10;
    
    // Create new validators
    for (let i = 0; i < validatorsToCreate.length; i += batchSize) {
      const batch = validatorsToCreate.slice(i, i + batchSize);
      await tb.validators.create(batch);
    }
    logProgress(`Created ${validatorsToCreate.length} new validators`);
    
    // Update existing validators
    for (let i = 0; i < validatorsToUpdate.length; i += batchSize) {
      const batch = validatorsToUpdate.slice(i, i + batchSize);
      await tb.validators.update(batch);
    }
    logProgress(`Updated ${validatorsToUpdate.length} validators`);
    
    // Create stake records
    for (let i = 0; i < stakeRecordsToCreate.length; i += batchSize) {
      const batch = stakeRecordsToCreate.slice(i, i + batchSize);
      await tb.stakeHistory.create(batch);
      stakeRecordsCreated += batch.length;
    }
    if (stakeRecordsCreated > 0) logProgress(`Created ${stakeRecordsCreated} stake records`);
    
    // Create performance records
    for (let i = 0; i < perfRecordsToCreate.length; i += batchSize) {
      const batch = perfRecordsToCreate.slice(i, i + batchSize);
      await tb.performanceHistory.create(batch);
      performanceRecordsCreated += batch.length;
    }
    
    // Update performance records (current epoch)
    for (let i = 0; i < perfRecordsToUpdate.length; i += batchSize) {
      const batch = perfRecordsToUpdate.slice(i, i + batchSize);
      await tb.performanceHistory.update(batch);
      performanceRecordsCreated += batch.length; // Count updates as well
    }
    logProgress(`Performance: ${perfRecordsToCreate.length} created, ${perfRecordsToUpdate.length} updated`);
    
    // Create commission snapshots (moved from inside loop)
    let snapshotsCreated = 0;
    for (let i = 0; i < snapshotsToCreate.length; i += batchSize) {
      const batch = snapshotsToCreate.slice(i, i + batchSize);
      await tb.snapshots.create(batch);
      snapshotsCreated += batch.length;
    }
    if (snapshotsCreated > 0) logProgress(`Created ${snapshotsCreated} commission snapshots`);
    
    // Create events (moved from inside loop)
    let eventsCreated = 0;
    for (let i = 0; i < eventsToCreate.length; i += batchSize) {
      const batch = eventsToCreate.slice(i, i + batchSize);
      await tb.events.create(batch);
      eventsCreated += batch.length;
    }
    if (eventsCreated > 0) logProgress(`Created ${eventsCreated} events`);
    
    // Create MEV snapshots
    for (let i = 0; i < mevSnapshotsToCreate.length; i += batchSize) {
      const batch = mevSnapshotsToCreate.slice(i, i + batchSize);
      await tb.mevSnapshots.create(batch);
    }
    if (mevSnapshotsToCreate.length > 0) logProgress(`Created ${mevSnapshotsToCreate.length} MEV snapshots`);
    
    // Create MEV events
    for (let i = 0; i < mevEventsToCreate.length; i += batchSize) {
      const batch = mevEventsToCreate.slice(i, i + batchSize);
      await tb.mevEvents.create(batch);
    }
    if (mevEventsToCreate.length > 0) logProgress(`Created ${mevEventsToCreate.length} MEV events`);
    
    // Create validator info history records (if enabled)
    let infoHistoryCreated = 0;
    console.log(`\n📚 ========== VALIDATOR INFO HISTORY CREATION ==========`);
    console.log(`📊 INFO HISTORY STATUS: enabled=${infoHistoryEnabled}, toCreate=${infoHistoryToCreate.length}`);
    console.log(`⏱️  Current time: ${new Date().toISOString()}`);
    
    if (infoHistoryEnabled && infoHistoryToCreate.length > 0) {
      try {
        console.log(`🚀 Starting info history creation for ${infoHistoryToCreate.length} records...`);
        logProgress(`Creating ${infoHistoryToCreate.length} validator info history records...`);
        console.log(`📝 Sample record (first):`, JSON.stringify(infoHistoryToCreate[0], null, 2));
        if (infoHistoryToCreate.length > 1) {
          console.log(`📝 Sample record (last):`, JSON.stringify(infoHistoryToCreate[infoHistoryToCreate.length - 1], null, 2));
        }
        
        for (let i = 0; i < infoHistoryToCreate.length; i += batchSize) {
          const batch = infoHistoryToCreate.slice(i, i + batchSize);
          await tb.validatorInfoHistory.create(batch);
          infoHistoryCreated += batch.length;
          console.log(`  ✓ Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records created`);
        }
        logProgress(`✅ Created ${infoHistoryCreated} validator info history records`);
      } catch (error: any) {
        logProgress(`❌ Info history creation failed: ${error.message}`);
        console.error("Full error:", error);
        console.error("Stack:", error.stack);
      }
    } else if (!infoHistoryEnabled) {
      logProgress(`⚠️ Info history tracking skipped (table not available or initial fetch failed)`);
    } else {
      logProgress(`ℹ️ No validator info changes detected (${infoHistoryToCreate.length} records to create)`);
    }

    console.log(`\n🎉 ========== SNAPSHOT DATA COLLECTION COMPLETE ==========`);
    console.log(`✅ Stake records created: ${stakeRecordsCreated}`);
    console.log(`✅ Performance records created: ${performanceRecordsCreated}`);
    console.log(`✅ Commission snapshots created: ${snapshotsCreated}`);
    console.log(`✅ Events created: ${eventsCreated}`);
    console.log(`✅ MEV snapshots created: ${mevSnapshotsToCreate.length}`);
    console.log(`✅ MEV events created: ${mevEventsToCreate.length}`);
    console.log(`📚 Validator info history records: ${infoHistoryCreated}`);
    logProgress(`✅ Main snapshot complete! Starting cleanup...`);
    
    // Cleanup: Delete performance records older than 30 days (keep ~15 epochs of history)
    // Solana epochs are ~2-3 days, so 15 epochs ≈ 30-45 days
    const oldestEpochToKeep = epoch - 15;
    console.log(`🧹 Cleaning up performance records older than epoch ${oldestEpochToKeep}...`);
    
    try {
      const oldPerfRecords = await tb.performanceHistory.select({
        filterByFormula: `{epoch} < ${oldestEpochToKeep}`,
        maxRecords: 1000, // Limit per batch
      }).firstPage();
      
      if (oldPerfRecords.length > 0) {
        // Delete in batches of 10
        for (let i = 0; i < oldPerfRecords.length; i += 10) {
          const batch = oldPerfRecords.slice(i, i + 10).map(r => r.id);
          await tb.performanceHistory.destroy(batch);
        }
        console.log(`🗑️  Deleted ${oldPerfRecords.length} old performance records`);
      } else {
        console.log(`✅ No old performance records to clean up`);
      }
    } catch (cleanupErr) {
      console.error(`⚠️  Cleanup error (non-fatal):`, cleanupErr);
    }
    
    console.log(`\n🎉 ========== SNAPSHOT JOB COMPLETED SUCCESSFULLY ==========`);
    logProgress(`✅ Snapshot complete!`);
    return NextResponse.json({ 
      ok: true, 
      epoch, 
      slot,
      metrics: {
        stakeRecordsCreated,
        performanceRecordsCreated,
        snapshotsCreated,
        eventsCreated,
        mevSnapshotsCreated: mevSnapshotsToCreate.length,
        mevEventsCreated: mevEventsToCreate.length,
        infoHistoryCreated,
      }
    });
  } catch (err: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ [${elapsed}s] Snapshot error:`, err.message || err);
    console.error("Stack trace:", err.stack);
    return NextResponse.json({ 
      error: String(err?.message || err),
      elapsed: `${elapsed}s`,
      hint: "Check logs above for where the job stopped"
    }, { status: 500 });
  }
}