/**
 * HTML Email Templates for RugAlert
 * Beautiful, professional emails with proper styling
 */

const BASE_URL = process.env.BASE_URL || "https://rugalert.pumpkinspool.com";

const emailStyles = `
  body { 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f5f5f5;
    margin: 0;
    padding: 0;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    background-color: #ffffff;
  }
  .header {
    background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
    padding: 30px 20px;
    text-align: center;
  }
  .logo {
    font-size: 32px;
    font-weight: bold;
    color: #ffffff;
    text-decoration: none;
    display: inline-block;
  }
  .alert-badge {
    display: inline-block;
    padding: 8px 16px;
    background-color: #ef4444;
    color: #ffffff;
    font-weight: bold;
    border-radius: 6px;
    font-size: 14px;
    margin: 10px 0;
  }
  .content {
    padding: 40px 30px;
  }
  .alert-title {
    font-size: 24px;
    font-weight: bold;
    color: #1f2937;
    margin: 0 0 20px 0;
  }
  .alert-message {
    font-size: 16px;
    color: #4b5563;
    margin: 0 0 30px 0;
    line-height: 1.8;
  }
  .info-box {
    background-color: #f9fafb;
    border-left: 4px solid #06b6d4;
    padding: 20px;
    margin: 20px 0;
    border-radius: 4px;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #e5e7eb;
  }
  .info-row:last-child {
    border-bottom: none;
  }
  .info-label {
    font-weight: 600;
    color: #6b7280;
  }
  .info-value {
    color: #1f2937;
    font-weight: 500;
  }
  .button {
    display: inline-block;
    padding: 14px 28px;
    background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
    color: #ffffff;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    margin: 20px 0;
    transition: opacity 0.2s;
  }
  .button:hover {
    opacity: 0.9;
  }
  .footer {
    background-color: #f9fafb;
    padding: 30px;
    text-align: center;
    border-top: 1px solid #e5e7eb;
  }
  .footer-text {
    font-size: 14px;
    color: #6b7280;
    margin: 10px 0;
  }
  .footer-link {
    color: #06b6d4;
    text-decoration: none;
  }
  .footer-link:hover {
    text-decoration: underline;
  }
`;

export function generateDelinquencyEmail(
  validatorName: string,
  votePubkey: string,
  epoch: number
): { subject: string; html: string } {
  const validatorUrl = `${BASE_URL}/validator/${votePubkey}`;
  const unsubscribeUrl = `${validatorUrl}#unsubscribe`;
  
  const subject = `🚨 [DELINQUENT] ${validatorName}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <a href="${BASE_URL}" class="logo">🚨 RUGALERT</a>
    </div>
    
    <!-- Content -->
    <div class="content">
      <div class="alert-badge">DELINQUENT</div>
      
      <h1 class="alert-title">Validator Delinquency Alert</h1>
      
      <p class="alert-message">
        This is an alert that validator <strong>${validatorName}</strong> 
        (<code>${votePubkey}</code>) <strong>is delinquent</strong> since epoch ${epoch}.
      </p>
      
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Validator: </span>
          <span class="info-value">${validatorName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Vote Pubkey:</span>
          <span class="info-value" style="font-family: monospace; font-size: 12px;">${votePubkey}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status:</span>
          <span class="info-value" style="color: #ef4444;">DELINQUENT (&gt;128 slots behind)</span>
        </div>
        <div class="info-row">
          <span class="info-label">Epoch:</span>
          <span class="info-value">${epoch}</span>
        </div>
      </div>
      
      <p class="alert-message">
        A validator is considered delinquent when it falls more than 128 slots behind the tip of the chain. 
        This typically means the validator is not voting or producing blocks.
      </p>
      
      <p class="alert-message">
        You received this alert because you subscribed to alerts for this validator. 
        We will not send you further alerts about this delinquency event unless the validator recovers and becomes delinquent again.
      </p>
      
      <center>
        <a href="${validatorUrl}" class="button">View Validator Details →</a>
      </center>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <p class="footer-text">
        <a href="${unsubscribeUrl}" class="footer-link">Click here to cancel delinquency alerts for this validator</a>
      </p>
      <p class="footer-text">
        <a href="${validatorUrl}" class="footer-link">Click here to cancel all alerts for this validator</a>
      </p>
      <p class="footer-text">
        Powered by <a href="${BASE_URL}" class="footer-link">RugAlert</a> - 
        Solana Validator Monitoring
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
  
  return { subject, html };
}

export function generateCommissionChangeEmail(
  validatorName: string,
  votePubkey: string,
  fromCommission: number | string,
  toCommission: number | string,
  delta: number,
  epoch: number,
  eventType: "RUG" | "CAUTION" | "INFO",
  commissionType: "INFLATION" | "MEV"
): { subject: string; html: string } {
  const validatorUrl = `${BASE_URL}/validator/${votePubkey}`;
  const unsubscribeUrl = `${validatorUrl}#unsubscribe`;
  
  const isRug = eventType === "RUG";
  const isCaution = eventType === "CAUTION";
  const isDecrease = delta < 0;
  
  // Check if MEV is being disabled (special case)
  const isMevDisabled = commissionType === "MEV" && toCommission === "MEV Disabled";
  const isMevEnabled = commissionType === "MEV" && fromCommission === "MEV Disabled";
  
  // Determine badge text, color, and emoji
  let alertBadge = "COMMISSION CHANGE";
  let alertColor = "#3b82f6"; // blue for INFO/decrease
  let emoji = "ℹ️";
  
  if (isMevDisabled) {
    // MEV disabled - this is bad for stakers (losing MEV rewards)
    alertBadge = "MEV DISABLED";
    alertColor = "#06b6d4"; // orange/warning color
    emoji = "⚠️";
  } else if (isMevEnabled) {
    // MEV enabled - informational
    alertBadge = "MEV ENABLED";
    alertColor = "#3b82f6"; // blue
    emoji = "ℹ️";
  } else if (isRug) {
    alertBadge = "RUG DETECTED";
    alertColor = "#dc2626"; // red
    emoji = "🚨";
  } else if (isCaution) {
    alertBadge = "COMMISSION INCREASE";
    alertColor = "#06b6d4"; // orange
    emoji = "⚠️";
  } else if (isDecrease) {
    alertBadge = "COMMISSION DECREASE";
    alertColor = "#10b981"; // green
    emoji = "✅";
  }
  
  const commissionLabel = commissionType === "MEV" ? "MEV Commission" : "Inflation Commission";
  
  // Determine subject line
  let subject = "";
  if (isMevDisabled) {
    subject = `${emoji} ${validatorName} Disabled MEV Rewards`;
  } else if (isMevEnabled) {
    subject = `${emoji} ${validatorName} Enabled MEV Rewards`;
  } else {
    const changeVerb = isDecrease ? "Lowered" : "Raised";
    subject = `${emoji} ${validatorName} ${changeVerb} ${commissionLabel}`;
  }
  
  const deltaDisplay = delta >= 0 ? `+${delta}pp` : `${delta}pp`;
  const deltaColor = isMevDisabled ? "#06b6d4" : (isRug ? "#dc2626" : (isCaution ? "#06b6d4" : (isDecrease ? "#10b981" : "#3b82f6")));
  
  // Determine impact message
  let impactMessage = "";
  if (isMevDisabled) {
    impactMessage = "This validator is no longer producing MEV (Maximum Extractable Value) rewards. Stakers will no longer receive MEV rewards from this validator, which reduces overall staking returns. This is an informational alert - the validator is not taking more commission, but you are losing access to MEV rewards.";
  } else if (isMevEnabled) {
    impactMessage = "This validator has enabled MEV (Maximum Extractable Value) rewards. Stakers may now receive additional MEV rewards from priority fees and bundles, depending on the validator's MEV commission rate.";
  } else if (isRug) {
    impactMessage = "A large commission increase like this significantly impacts your staking rewards. You may want to consider unstaking or monitoring the situation closely.";
  } else if (isCaution) {
    impactMessage = "This commission increase will affect your staking rewards. Monitor the validator's performance and consider your options.";
  } else if (isDecrease) {
    impactMessage = "This commission decrease will improve your staking rewards. You're now earning a higher percentage of rewards from this validator.";
  } else {
    impactMessage = "This commission change will affect your staking rewards. You may want to monitor the validator's performance.";
  }
  
  // Format commission display (don't show % after "MEV Disabled" or if already has %)
  const fromDisplay = typeof fromCommission === "string" 
    ? (fromCommission.includes("MEV Disabled") || fromCommission.endsWith("%"))
      ? fromCommission 
      : `${fromCommission}%`
    : `${fromCommission}%`;
  const toDisplay = typeof toCommission === "string"
    ? (toCommission.includes("MEV Disabled") || toCommission.endsWith("%"))
      ? toCommission
      : `${toCommission}%`
    : `${toCommission}%`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    ${emailStyles}
    .alert-badge { background-color: ${alertColor}; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <a href="${BASE_URL}" class="logo">${emoji} RUGALERT</a>
    </div>
    
    <!-- Content -->
    <div class="content">
      <div class="alert-badge">${alertBadge}</div>
      
      <h1 class="alert-title">${isMevDisabled ? "MEV Rewards Disabled" : isMevEnabled ? "MEV Rewards Enabled" : `${commissionLabel} Change Detected`}</h1>
      
      <p class="alert-message">
        ${isMevDisabled 
          ? `This is an alert that validator <strong>${validatorName}</strong> (<code>${votePubkey}</code>) is <strong>no longer producing MEV rewards</strong>.`
          : isMevEnabled
          ? `This is an alert that validator <strong>${validatorName}</strong> (<code>${votePubkey}</code>) has <strong>enabled MEV rewards</strong>.`
          : `This is an alert that validator <strong>${validatorName}</strong> (<code>${votePubkey}</code>) has ${isRug ? "<strong>significantly increased</strong>" : (isDecrease ? "<strong>decreased</strong>" : "changed")} their ${commissionLabel.toLowerCase()}.`
        }
      </p>
      
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Validator: </span>
          <span class="info-value">${validatorName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Vote Pubkey:</span>
          <span class="info-value" style="font-family: monospace; font-size: 12px;">${votePubkey}</span>
        </div>
        <div class="info-row">
          <span class="info-label">${commissionLabel}:</span>
          <span class="info-value">
            <span style="color: #6b7280;">${fromDisplay}</span>
            <span style="margin: 0 8px;">→</span>
            <span style="color: ${deltaColor}; font-weight: 700;">${toDisplay}</span>
            ${!isMevDisabled && !isMevEnabled ? `<span style="color: ${deltaColor}; margin-left: 8px;">(${deltaDisplay})</span>` : ''}
          </span>
        </div>
        <div class="info-row">
          <span class="info-label">Epoch:</span>
          <span class="info-value">${epoch}</span>
        </div>
      </div>
      
      <p class="alert-message">
        ${impactMessage}
      </p>
      
      <center>
        <a href="${validatorUrl}" class="button">View Validator Details →</a>
      </center>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <p class="footer-text">
        <a href="${unsubscribeUrl}" class="footer-link">Click here to cancel commission alerts for this validator</a>
      </p>
      <p class="footer-text">
        <a href="${validatorUrl}" class="footer-link">Click here to cancel all alerts for this validator</a>
      </p>
      <p class="footer-text">
        Powered by <a href="${BASE_URL}" class="footer-link">RugAlert</a> - 
        Solana Validator Monitoring
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
  
  return { subject, html };
}

