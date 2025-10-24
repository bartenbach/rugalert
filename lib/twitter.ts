/**
 * Twitter/X API Integration for RugAlert
 * 
 * Posts commission rug alerts to X so they can be retweeted by the community
 */

export async function postToTwitter(message: string): Promise<boolean> {
  try {
    const twitterWebhookUrl = process.env.TWITTER_WEBHOOK_URL;
    
    if (!twitterWebhookUrl) {
      console.log("⚠️ Twitter webhook not configured (TWITTER_WEBHOOK_URL missing)");
      return false;
    }

    // Use a webhook service like Zapier or Make.com to bridge to Twitter API
    // This avoids dealing with OAuth complexity in serverless functions
    const response = await fetch(twitterWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: message,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      console.error(`❌ Twitter post failed: ${response.status}`);
      return false;
    }

    console.log("✅ Posted to Twitter/X");
    return true;
  } catch (error: any) {
    console.error("❌ Twitter error:", error.message);
    return false;
  }
}

/**
 * Format a commission rug alert for Twitter
 * Optimized for engagement and retweets
 */
export function formatTwitterRug(
  validatorName: string,
  votePubkey: string,
  oldCommission: number,
  newCommission: number,
  delta: number,
  validatorUrl: string
): string {
  const emoji = delta >= 90 ? "🚨" : delta >= 50 ? "⚠️" : "📢";
  
  // Keep it concise for Twitter (280 char limit)
  const message = [
    `${emoji} COMMISSION RUG ALERT`,
    ``,
    `${validatorName || "Unknown Validator"}`,
    `${oldCommission}% → ${newCommission}% (+${delta}%)`,
    ``,
    `🔍 Details: ${validatorUrl}`,
    ``,
    `#Solana #ValidatorAlert #CommissionRug`,
  ].join("\n");

  return message;
}

/**
 * Format a MEV commission rug alert for Twitter
 */
export function formatTwitterMevRug(
  validatorName: string,
  votePubkey: string,
  oldCommission: number,
  newCommission: number,
  delta: number,
  validatorUrl: string
): string {
  const emoji = delta >= 90 ? "🚨" : delta >= 50 ? "⚠️" : "📢";
  
  const message = [
    `${emoji} MEV COMMISSION RUG ALERT`,
    ``,
    `${validatorName || "Unknown Validator"}`,
    `MEV: ${oldCommission}% → ${newCommission}% (+${delta}%)`,
    ``,
    `🔍 Details: ${validatorUrl}`,
    ``,
    `#Solana #MEV #JITO #ValidatorAlert`,
  ].join("\n");

  return message;
}

