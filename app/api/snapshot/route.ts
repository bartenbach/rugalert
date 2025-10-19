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
    
    const to = eligibleSubs.map((s) => String(s.get("email"))).filter(Boolean);
    console.log(`📧 Sending ${eventType} email to ${to.length} recipients:`, to);
    
    if (!to.length) {
      console.log("⚠️ No eligible recipients for this event type");
      return;
    }
    
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: process.env.ALERTS_FROM, to, subject, text }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.error("❌ Email send failed:", response.status, result);
    } else {
      console.log("✅ Email sent successfully:", result);
    }
  } catch (error) {
    console.error("❌ Email error:", error);
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
    }>;

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
          if (type === "RUG") {
            const msg = `RUG: ${v.votePubkey} ${from}% → ${to}% at epoch ${epoch} (slot ${slot})`;
            await sendDiscord(msg);
            await sendEmail("Solana Validator Commission RUG detected", `${msg}\n${process.env.BASE_URL || ""}/history`, "RUG");
          } else if (type === "CAUTION") {
            const msg = `CAUTION: ${v.votePubkey} ${from}% → ${to}% (+${delta}pp) at epoch ${epoch}`;
            await sendEmail("Solana Validator Commission Jump", `${msg}\n${process.env.BASE_URL || ""}/history`, "CAUTION");
          } else if (type === "INFO") {
            const msg = `INFO: ${v.votePubkey} ${from}% → ${to}% at epoch ${epoch}`;
            await sendEmail("Solana Validator Commission Change", `${msg}\n${process.env.BASE_URL || ""}/history`, "INFO");
          }
        }
      }
      // If commission didn’t change, we write nothing and (correctly) emit no event.
    }

    return NextResponse.json({ ok: true, epoch, slot });
  } catch (err: any) {
    console.error("snapshot error:", err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}