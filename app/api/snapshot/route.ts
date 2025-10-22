import { NextRequest, NextResponse } from "next/server";
import { tb } from "../../../lib/airtable";
import { detectMevRug, fetchAllJitoValidators } from "../../../lib/jito";

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
    const emailPromises = emails.map(async (email) => {
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
          return { email, success: false, error: result };
        } else {
          console.log(`✅ Email sent to ${email}`);
          return { email, success: true };
        }
      } catch (error) {
        console.error(`❌ Email error for ${email}:`, error);
        return { email, success: false, error };
      }
    });
    
    // Wait for all emails to send
    const results = await Promise.all(emailPromises);
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

  try {
    // 1) Pull current vote accounts + epoch/slot + cluster nodes for versions
    const [votes, epochInfo, clusterNodes] = await Promise.all([
      rpc("getVoteAccounts", []),
      rpc("getEpochInfo", []),
      rpc("getClusterNodes", []),
    ]);
    const epoch = Number(epochInfo.epoch);
    const slot = Number(epochInfo.absoluteSlot);
    
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
    console.log(`🎯 Fetching Jito MEV data...`);
    const jitoValidators = await fetchAllJitoValidators();
    console.log(`✅ Found ${jitoValidators.size} Jito-enabled validators`);

    // Track stake and performance metrics
    let stakeRecordsCreated = 0;
    let performanceRecordsCreated = 0;
    let mevSnapshotsCreated = 0;
    let mevEventsCreated = 0;
    
    // Get block production data for skip rate calculation (current epoch only)
    const blockProduction = await rpc("getBlockProduction", [{ epoch }]);
    const blockProductionData = blockProduction?.value?.byIdentity || {};
    
    // Fetch ALL stake accounts at once to avoid per-validator RPC calls
    // WARNING: This can be very expensive on mainnet (millions of accounts)
    // Set ENABLE_STAKE_TRACKING=false to disable if causing timeouts
    let stakeByVoter = new Map<string, { activating: number; deactivating: number }>();
    let stakeAccountCounts = new Map<string, number>(); // Count of stake accounts per validator
    const enableStakeTracking = process.env.ENABLE_STAKE_TRACKING !== 'false';
    
    if (enableStakeTracking) {
      console.log(`📊 Fetching all stake accounts with pagination (this may take a while)...`);
      try {
        // Use Helius getProgramAccountsV2 with pagination
        const allStakeAccounts: any[] = [];
        let paginationKey: string | null = null;
        let pageCount = 0;
        
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
          
          const response = await rpc("getProgramAccountsV2", [
            "Stake11111111111111111111111111111111111111",
            params,
          ]);
          
          const accounts = response.accounts || [];
          allStakeAccounts.push(...accounts);
          paginationKey = response.paginationKey || null;
          
          console.log(`  Fetched page ${pageCount}: ${accounts.length} accounts (total: ${allStakeAccounts.length})`);
        } while (paginationKey);
        
        console.log(`📊 Processing ${allStakeAccounts.length} stake accounts from ${pageCount} pages...`);
        
        // Group stake by voter pubkey and count accounts
        for (const account of allStakeAccounts as any[]) {
          const stakeData = account?.account?.data?.parsed?.info?.stake;
          if (stakeData?.delegation) {
            const delegation = stakeData.delegation;
            const voter = delegation.voter;
            const activationEpoch = Number(delegation.activationEpoch || 0);
            const deactivationEpoch = Number(delegation.deactivationEpoch || Number.MAX_SAFE_INTEGER);
            const stake = Number(delegation.stake || 0);
            
            // Count ALL stake accounts per validator (including inactive, activating, deactivating)
            stakeAccountCounts.set(voter, (stakeAccountCounts.get(voter) || 0) + 1);
            
            if (!stakeByVoter.has(voter)) {
              stakeByVoter.set(voter, { activating: 0, deactivating: 0 });
            }
            
            const data = stakeByVoter.get(voter)!;
            
            // Stake is activating if activation epoch is current or future (still warming up)
            // Stake takes multiple epochs to fully activate
            if (activationEpoch >= epoch) {
              data.activating += stake;
            }
            
            // Stake is deactivating if deactivation epoch has been set (even if in future)
            // Once set, the stake begins cooling down over multiple epochs
            if (deactivationEpoch !== Number.MAX_SAFE_INTEGER) {
              data.deactivating += stake;
            }
          }
        }
        console.log(`✅ Processed stake accounts for ${stakeByVoter.size} voters`);
        console.log(`✅ Counted ${stakeAccountCounts.size} validators with active stake accounts`);
      } catch (e) {
        console.log(`⚠️ Could not fetch stake accounts (continuing without activating/deactivating data):`, e);
      }
    } else {
      console.log(`⏭️ Stake tracking disabled (set ENABLE_STAKE_TRACKING=true to enable)`);
    }
    
    // Fetch vote account data for all validators to get CURRENT EPOCH vote credits
    console.log(`📊 Fetching vote credits for ${allVotes.length} validators (current epoch ${epoch})...`);
    const voteCreditsMap = new Map<string, number>();
    
    // Batch the vote account fetches to avoid too many concurrent requests
    const BATCH_SIZE = 100;
    for (let i = 0; i < allVotes.length; i += BATCH_SIZE) {
      const batch = allVotes.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (v) => {
        try {
          const voteAccountInfo = await rpc("getAccountInfo", [
            v.votePubkey,
            { encoding: "jsonParsed" }
          ]);
          
          const epochCreditsArray = voteAccountInfo?.value?.data?.parsed?.info?.epochCredits;
          if (epochCreditsArray && Array.isArray(epochCreditsArray)) {
            // epochCredits format: [[epoch, cumulative_credits, prev_epoch_cumulative], ...]
            // Look for CURRENT epoch to show in-progress performance
            const currentEpochCredits = epochCreditsArray.find((entry: any) => 
              Number(entry[0]) === epoch
            );
            if (currentEpochCredits) {
              // Get credits earned SO FAR in current epoch (current cumulative - previous cumulative)
              const earnedCredits = Number(currentEpochCredits[1]) - Number(currentEpochCredits[2] || 0);
              voteCreditsMap.set(v.votePubkey, earnedCredits);
            }
          }
        } catch (e) {
          // Silently skip validators with errors
        }
      });
      
      await Promise.all(batchPromises);
      console.log(`  Processed ${Math.min(i + BATCH_SIZE, allVotes.length)}/${allVotes.length} vote accounts`);
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
    await tb.performanceHistory.select({
      filterByFormula: `{epoch} = ${epoch}`,
      pageSize: 100
    }).eachPage((records, fetchNextPage) => {
      records.forEach(r => existingPerfKeys.add(String(r.get('key'))));
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
    
    console.log(`✅ Pre-fetch complete. Found ${existingValidators.size} validators, ${existingStakeKeys.size} stake records, ${existingPerfKeys.size} perf records, ${existingMevKeys.size} MEV records`);
    
    // Batch arrays for bulk creation
    const validatorsToCreate: any[] = [];
    const validatorsToUpdate: {id: string, fields: any}[] = [];
    const stakeRecordsToCreate: any[] = [];
    const perfRecordsToCreate: any[] = [];
    const mevSnapshotsToCreate: any[] = [];
    const mevEventsToCreate: any[] = [];

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

    // 3) Process each validator
    for (const v of allVotes) {
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
        // Cache activeStake (locked at epoch boundaries)
        patch.activeStake = Number(v.activatedStake || 0);
        // Update Jito status
        patch.jitoEnabled = isJitoEnabled;
        // Update stake account count
        patch.stakeAccountCount = accountCount;
        if (Object.keys(patch).length) {
          validatorsToUpdate.push({ id: existing.id, fields: patch });
        }
      } else {
        validatorsToCreate.push({
          fields: {
            votePubkey: v.votePubkey,
            identityPubkey: v.nodePubkey,
            delinquent: isDelinquent,
            activeStake: Number(v.activatedStake || 0),
            jitoEnabled: isJitoEnabled,
            stakeAccountCount: accountCount,
            ...(chainName ? { name: chainName } : {}),
            ...(iconUrl   ? { iconUrl } : {}),
            ...(website   ? { website } : {}),
            ...(description ? { description } : {}),
            ...(version ? { version } : {}),
          }
        });
      }

      // ---- STAKE HISTORY TRACKING ----
      const stakeKey = `${v.votePubkey}-${epoch}`;
      if (!existingStakeKeys.has(stakeKey) && v.activatedStake !== undefined) {
        // Get activating/deactivating stake from pre-fetched data
        const stakeData = stakeByVoter.get(v.votePubkey);
        
        stakeRecordsToCreate.push({
          fields: {
            key: stakeKey,
            votePubkey: v.votePubkey,
            epoch,
            activeStake: Number(v.activatedStake || 0),
            ...(stakeData?.activating ? { activatingStake: stakeData.activating } : {}),
            ...(stakeData?.deactivating ? { deactivatingStake: stakeData.deactivating } : {}),
          }
        });
      }

      // ---- PERFORMANCE HISTORY TRACKING ----
      const blockData = blockProductionData[v.nodePubkey];
      const perfKey = `${v.votePubkey}-${epoch}`;
      if (!existingPerfKeys.has(perfKey)) {
        let skipRate = 0;
        if (blockData) {
          const leaderSlots = Number(blockData[0] || 0);
          const blocksProduced = Number(blockData[1] || 0);
          
          if (leaderSlots > 0) {
            skipRate = ((leaderSlots - blocksProduced) / leaderSlots) * 100;
          }
        }
        
        // Get vote credits from pre-fetched map and calculate percentage
        const voteCredits = voteCreditsMap.get(v.votePubkey);
        const voteCreditsPercentage = (voteCredits !== undefined && maxVoteCredits > 0)
          ? (voteCredits / maxVoteCredits) * 100
          : 0;
        
        perfRecordsToCreate.push({
          fields: {
            key: perfKey,
            votePubkey: v.votePubkey,
            epoch,
            skipRate: Math.max(0, Math.min(100, skipRate)),
            ...(voteCredits !== undefined ? { 
              voteCredits,
              voteCreditsPercentage: Math.round(voteCreditsPercentage * 100) / 100, // 2 decimal places
              maxPossibleCredits: maxVoteCredits,
            } : {}),
          }
        });
      }

      // 4) DELTA-ONLY SNAPSHOTS
      // Get the most recent snapshot for this validator (by slot)
      const last = await tb.snapshots.select({
        filterByFormula: `{votePubkey} = "${v.votePubkey}"`,
        sort: [{ field: "slot", direction: "desc" }],
        maxRecords: 1,
      }).firstPage();

      const prevCommission = last[0]?.get("commission");
      const prevEpoch = last[0]?.get("epoch");

      // Only write a new snapshot if commission changed since the most recent snapshot,
      // OR if there is no previous snapshot at all.
      const hasPrev = prevCommission !== undefined && prevCommission !== null;
      const commissionChanged = !hasPrev || Number(prevCommission) !== v.commission;

      if (commissionChanged) {
        // Insert snapshot for this slot (idempotent per key)
        const key = `${v.votePubkey}-${slot}`;
        const exists = await tb.snapshots
          .select({ filterByFormula: `{key} = "${key}"`, maxRecords: 1 })
          .firstPage();
        if (!exists[0]) {
          await tb.snapshots.create([{
            fields: { key, votePubkey: v.votePubkey, epoch, slot, commission: v.commission }
          }]);
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

          // Create event for any commission change
          await tb.events.create([{
            fields: { votePubkey: v.votePubkey, epoch, type, fromCommission: from, toCommission: to, delta }
          }]);

          // Send notifications based on event type
          const baseUrl = process.env.BASE_URL || "https://rugalert.pumpkinspool.com";
          const validatorUrl = `${baseUrl}/validator/${v.votePubkey}`;
          const validatorName = chainName || v.votePubkey;
          
          if (type === "RUG") {
            const msg = `🚨 RUG DETECTED!\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nCommission: ${from}% → ${to}%\nEpoch: ${epoch}\n\nView full details: ${validatorUrl}`;
            await sendDiscord(msg);
            await sendEmail("🚨 Solana Validator Commission Rug Detected", msg, "RUG");
          } else if (type === "CAUTION") {
            const msg = `⚠️ CAUTION: Large Commission Increase Detected\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nCommission: ${from}% → ${to}% (+${delta}pp)\nEpoch: ${epoch}\n\nView full details: ${validatorUrl}`;
            await sendDiscord(msg);
            await sendEmail("⚠️ Solana Validator Large Commission Jump Detected", msg, "CAUTION");
          } else if (type === "INFO") {
            const msg = `📊 Commission Change\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nCommission: ${from}% → ${to}%\nEpoch: ${epoch}\n\nView full details: ${validatorUrl}`;
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
          mevSnapshotsCreated++;
          
          // Debug: Log first few MEV snapshots
          if (mevSnapshotsCreated <= 3) {
            console.log(`  Creating MEV snapshot for ${v.votePubkey.substring(0, 8)}... - MEV: ${jitoInfo.mevCommission}%, Priority: ${jitoInfo.priorityFeeCommission}%`);
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
              mevEventsCreated++;
              
              // Send notifications for MEV rugs
              const baseUrl = process.env.BASE_URL || "https://rugalert.pumpkinspool.com";
              const validatorUrl = `${baseUrl}/validator/${v.votePubkey}`;
              const validatorName = chainName || v.votePubkey;
              
              if (eventType === "RUG") {
                const msg = `🚨 MEV RUG DETECTED!\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nMEV Commission: ${prevMevCommission}% → ${currentMevCommission}%\nEpoch: ${epoch}\n\nView full details: ${validatorUrl}`;
                await sendDiscord(msg);
                await sendEmail("🚨 Solana Validator MEV Commission Rug Detected", msg, "RUG");
              } else if (eventType === "CAUTION") {
                const msg = `⚠️ CAUTION: Large MEV Commission Increase Detected\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nMEV Commission: ${prevMevCommission}% → ${currentMevCommission}% (+${delta}pp)\nEpoch: ${epoch}\n\nView full details: ${validatorUrl}`;
                await sendDiscord(msg);
                await sendEmail("⚠️ Solana Validator MEV Commission Increase", msg, "CAUTION");
              }
            }
          }
        }
      }
    }

    // BATCH CREATE/UPDATE operations to avoid timeout
    console.log(`📦 Batching operations: ${validatorsToCreate.length} new validators, ${validatorsToUpdate.length} validator updates`);
    console.log(`📦 Batching: ${stakeRecordsToCreate.length} stake records, ${perfRecordsToCreate.length} perf records`);
    
    // Airtable allows max 10 records per create/update call, so batch them
    const batchSize = 10;
    
    // Create new validators
    for (let i = 0; i < validatorsToCreate.length; i += batchSize) {
      const batch = validatorsToCreate.slice(i, i + batchSize);
      await tb.validators.create(batch);
    }
    
    // Update existing validators
    for (let i = 0; i < validatorsToUpdate.length; i += batchSize) {
      const batch = validatorsToUpdate.slice(i, i + batchSize);
      await tb.validators.update(batch);
    }
    
    // Create stake records
    for (let i = 0; i < stakeRecordsToCreate.length; i += batchSize) {
      const batch = stakeRecordsToCreate.slice(i, i + batchSize);
      await tb.stakeHistory.create(batch);
      stakeRecordsCreated += batch.length;
    }
    
    // Create performance records
    for (let i = 0; i < perfRecordsToCreate.length; i += batchSize) {
      const batch = perfRecordsToCreate.slice(i, i + batchSize);
      await tb.performanceHistory.create(batch);
      performanceRecordsCreated += batch.length;
    }
    
    // Create MEV snapshots
    for (let i = 0; i < mevSnapshotsToCreate.length; i += batchSize) {
      const batch = mevSnapshotsToCreate.slice(i, i + batchSize);
      await tb.mevSnapshots.create(batch);
    }
    
    // Create MEV events
    for (let i = 0; i < mevEventsToCreate.length; i += batchSize) {
      const batch = mevEventsToCreate.slice(i, i + batchSize);
      await tb.mevEvents.create(batch);
    }

    console.log(`✅ Stake records created: ${stakeRecordsCreated}`);
    console.log(`✅ Performance records created: ${performanceRecordsCreated}`);
    console.log(`✅ MEV snapshots created: ${mevSnapshotsCreated}`);
    console.log(`✅ MEV events created: ${mevEventsCreated}`);
    
    // ---- INITIALIZE DAILY UPTIME RECORDS ----
    // Create today's uptime records if they don't exist yet
    // The delinquency-check cron will update these every minute
    // This is non-critical, so we wrap in try-catch to not break the whole job
    let uptimeRecordsCreated = 0;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      console.log(`\n📅 Checking daily uptime records for ${todayStr}...`);
      
      // Check if we already have records for today
      const existingUptimeRecords = new Set<string>();
      await tb.dailyUptime
        .select({
          filterByFormula: `{date} = '${todayStr}'`,
          fields: ['votePubkey'],
          pageSize: 100,
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach((record) => {
            const vp = record.get('votePubkey') as string;
            if (vp) existingUptimeRecords.add(vp);
          });
          fetchNextPage();
        });
      
      console.log(`📦 Found ${existingUptimeRecords.size} existing uptime records for today`);
      
      // Create records for validators that don't have one yet
      const uptimeRecordsToCreate: any[] = [];
      for (const v of allVotes) {
        if (!existingUptimeRecords.has(v.votePubkey)) {
          uptimeRecordsToCreate.push({
            fields: {
              key: `${v.votePubkey}-${todayStr}`,
              votePubkey: v.votePubkey,
              date: todayStr,
              delinquentMinutes: 0,
              totalChecks: 0,
              uptimePercent: 100,
            }
          });
        }
      }
      
      if (uptimeRecordsToCreate.length > 0) {
        console.log(`📝 Creating ${uptimeRecordsToCreate.length} new uptime records...`);
        for (let i = 0; i < uptimeRecordsToCreate.length; i += batchSize) {
          const batch = uptimeRecordsToCreate.slice(i, i + batchSize);
          await tb.dailyUptime.create(batch);
          uptimeRecordsCreated += batch.length;
        }
        console.log(`✅ Daily uptime records created: ${uptimeRecordsCreated}`);
      } else {
        console.log(`✅ All daily uptime records already exist`);
      }
    } catch (uptimeError: any) {
      console.error(`⚠️  Failed to create uptime records (non-critical):`, uptimeError.message);
      // Don't fail the whole job - uptime records will be created by delinquency-check
    }
    
    return NextResponse.json({ 
      ok: true, 
      epoch, 
      slot,
      metrics: {
        stakeRecordsCreated,
        performanceRecordsCreated,
        mevSnapshotsCreated,
        mevEventsCreated,
        uptimeRecordsCreated,
      }
    });
  } catch (err: any) {
    console.error("snapshot error:", err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}