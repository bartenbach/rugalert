import { NextRequest, NextResponse } from "next/server";
import { findValidator, tb } from "../../../lib/airtable";

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
    // 1) Pull current vote accounts + epoch/slot
    const [votes, epochInfo] = await Promise.all([
      rpc("getVoteAccounts", []),
      rpc("getEpochInfo", []),
    ]);
    const epoch = Number(epochInfo.epoch);
    const slot = Number(epochInfo.absoluteSlot);
    const allVotes = [...votes.current, ...votes.delinquent] as Array<{
      votePubkey: string;
      nodePubkey: string;   // identity pubkey
      commission: number;
      activatedStake: number;
      epochVoteAccount?: boolean;
      epochCredits?: Array<[number, number, number]>; // [epoch, credits, previousCredits]
      lastVote?: number;
    }>;

    // Track stake and performance metrics
    let stakeRecordsCreated = 0;
    let performanceRecordsCreated = 0;

    // 2) jsonParsed GPA over Config program (validatorInfo records)
    const gpa = await rpc("getProgramAccounts", [
      "Config1111111111111111111111111111111111111",
      { encoding: "jsonParsed", commitment: "confirmed" },
    ]);

    // identityPubkey -> { name, iconUrl, website }
    const infoMap = new Map<
      string,
      { name?: string; iconUrl?: string; website?: string }
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
      if (identity && (name || iconUrl || website)) {
        infoMap.set(identity, { name, iconUrl, website });
      }
    }

    // 3) Process each validator
    for (const v of allVotes) {
      const meta = infoMap.get(v.nodePubkey) || {};
      const chainName = meta.name;
      // DiceBear fallback ONLY when missing iconUrl
      const iconUrl = meta.iconUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(v.nodePubkey)}`;
      const website = meta.website;

      // Upsert validator row (write only if we have values to set)
      const existing = await findValidator(v.votePubkey);
      if (existing) {
        const patch: any = {};
        if (existing.get("identityPubkey") !== v.nodePubkey)
          patch.identityPubkey = v.nodePubkey;
        if (chainName) patch.name = chainName;
        if (iconUrl)   patch.iconUrl = iconUrl;
        if (website)   patch.website = website; // if you added this column
        if (Object.keys(patch).length) await tb.validators.update(existing.id, patch);
      } else {
        await tb.validators.create([{
          fields: {
            votePubkey: v.votePubkey,
            identityPubkey: v.nodePubkey,
            ...(chainName ? { name: chainName } : {}),
            ...(iconUrl   ? { iconUrl } : {}),
            ...(website   ? { website } : {}),
          }
        }]);
      }

      // ---- STAKE HISTORY TRACKING ----
      // Record active stake for this epoch (idempotent)
      const stakeKey = `${v.votePubkey}-${epoch}`;
      const existingStake = await tb.stakeHistory
        .select({ filterByFormula: `{key} = "${stakeKey}"`, maxRecords: 1 })
        .firstPage();
      
      if (!existingStake[0] && v.activatedStake) {
        await tb.stakeHistory.create([{
          fields: {
            key: stakeKey,
            votePubkey: v.votePubkey,
            epoch,
            activeStake: Number(v.activatedStake),
          }
        }]);
        stakeRecordsCreated++;
      }

      // ---- PERFORMANCE HISTORY TRACKING ----
      // Calculate skip rate and record performance metrics
      // Skip rate = (slots_in_epoch - credits_earned) / slots_in_epoch * 100
      // We can get credits from epochCredits array [epoch, credits, previousCredits]
      if (v.epochCredits && v.epochCredits.length > 0) {
        // Get the most recent epoch credits entry
        const latestCredits = v.epochCredits[v.epochCredits.length - 1];
        const [creditEpoch, credits, previousCredits] = latestCredits;
        
        // Only record if this is for a completed epoch (not current)
        if (Number(creditEpoch) < epoch) {
          const perfKey = `${v.votePubkey}-${creditEpoch}`;
          const existingPerf = await tb.performanceHistory
            .select({ filterByFormula: `{key} = "${perfKey}"`, maxRecords: 1 })
            .firstPage();
          
          if (!existingPerf[0]) {
            // Total possible credits per epoch (can change, but currently 6912000)
            // This is 432,000 slots/epoch * 16 votes per slot = 6,912,000
            const SLOTS_PER_EPOCH = 432000;
            const VOTES_PER_SLOT = 16;
            const MAX_CREDITS = SLOTS_PER_EPOCH * VOTES_PER_SLOT;
            
            const earnedCredits = Number(credits) - Number(previousCredits);
            const skipRate = ((MAX_CREDITS - earnedCredits) / MAX_CREDITS) * 100;
            
            await tb.performanceHistory.create([{
              fields: {
                key: perfKey,
                votePubkey: v.votePubkey,
                epoch: Number(creditEpoch),
                credits: earnedCredits,
                skipRate: Math.max(0, Math.min(100, skipRate)), // Clamp between 0-100
              }
            }]);
            performanceRecordsCreated++;
          }
        }
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
            await sendEmail("🚨 Solana Validator Commission RUG Detected", msg, "RUG");
          } else if (type === "CAUTION") {
            const msg = `⚠️ CAUTION: Large Commission Increase\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nCommission: ${from}% → ${to}% (+${delta}pp)\nEpoch: ${epoch}\n\nView full details: ${validatorUrl}`;
            await sendEmail("⚠️ Solana Validator Commission Jump", msg, "CAUTION");
          } else if (type === "INFO") {
            const msg = `📊 Commission Change\n\nValidator: ${validatorName}\nVote Pubkey: ${v.votePubkey}\nCommission: ${from}% → ${to}%\nEpoch: ${epoch}\n\nView full details: ${validatorUrl}`;
            await sendEmail("📊 Solana Validator Commission Change", msg, "INFO");
          }
        }
      }
      // If commission didn’t change, we write nothing and (correctly) emit no event.
    }

    console.log(`📊 Stake records created: ${stakeRecordsCreated}`);
    console.log(`📊 Performance records created: ${performanceRecordsCreated}`);
    
    return NextResponse.json({ 
      ok: true, 
      epoch, 
      slot,
      metrics: {
        stakeRecordsCreated,
        performanceRecordsCreated,
      }
    });
  } catch (err: any) {
    console.error("snapshot error:", err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}