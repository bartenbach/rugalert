/**
 * Known Staker Mapping (manual overrides)
 *
 * Maps staker public keys to human-readable names for delegation programs
 * and foundations that are NOT auto-resolved via SPL Stake Pool metadata.
 * These take priority over auto-resolved names.
 */
export const KNOWN_STAKERS: Record<string, string> = {
  "mpa4abUkjQoAvPzREkh5Mo75hZhPFQ2FSH6w7dWKuQ5": "Solana Foundation",
  "stWirqFCf2Uts1JBL1Jsd3r6VBWhgnpdPxCTe1MFjrq": "Marinade",
  "9eG63CdHjsfhHmobHgLtESGC8GabbmRcaSpHAZrtmhco": "Marinade",
  "STNi1NHDUi6Hvibvonawgze8fM83PFLeJhuGMEXyGps": "Marinade Select",
  "6WecYymEARvjG5ZyqkrVQ6YkhPfujNzWpSPwNKXHCbV2": "Jito",
  "6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS": "Jito",
  "Hodkwm8xf43JzRuKNYPGnYJ7V9cXZ7LJGNy96TWQiSGN": "JagPool",
  "stk9ApL5HeVAwPLr3TLhDXdZS8ptVu7zp6ov8HFDuMi": "BlazeStake",
  "BqPJdYKKpReEfXHv8kgdmRcBfLToBSHpt1qThtb52GSs": "dynoSOL",
  "FKDyJz5tPUy1ArAUba7ziQLbMKzaivRnHiW4FHzCSE9t": "jucySOL",
  "AKJt3m2xJ6ANda9adBGqb5BMrheKJSwxyCfYkLuZNmjn": "aeroSOL",
  "3etKXcW2fzEJR5YXoSKSmP6UZ633g9uiFv5yuqFUf66k": "Socean",
  "EpH4ZKSeViL5qAHA9QANYVHxdmuzbUH2T79f32DmSCaM": "Shinobi Performance Pool",
  "4cpnpiwgBfUgELVwNYiecwGti45YHSH3R72CPkFTiwJt": "DoubleZero Delegation Program",
  "8CCr7yVngeqnyodu79FNd5qV6XT8RkU1pa8EgZynecjS": "Firedancer Delegation Program",
};

/**
 * Get a human-readable label for a staker pubkey.
 *
 * Priority:
 *  1. Manual KNOWN_STAKERS overrides (above)
 *  2. Dynamically fetched SPL Stake Pool names (passed via stakePoolNames)
 *  3. null (caller falls back to truncated pubkey)
 */
export function getStakerLabel(
  stakerPubkey: string,
  stakePoolNames?: Record<string, string>
): string | null {
  if (KNOWN_STAKERS[stakerPubkey]) return KNOWN_STAKERS[stakerPubkey];
  if (stakePoolNames?.[stakerPubkey]) return stakePoolNames[stakerPubkey];
  return null;
}

/**
 * Truncate a pubkey for display
 */
export function truncatePubkey(pubkey: string, chars = 4): string {
  return `${pubkey.slice(0, chars)}...${pubkey.slice(-chars)}`;
}

/**
 * Format a stake account for display
 */
export interface StakeAccountBreakdown {
  staker: string;
  amount: number; // lamports
  label: string | null;
  epoch?: number; // activation or deactivation epoch
}

export function formatStakeAccount(account: StakeAccountBreakdown): string {
  const solAmount = (account.amount / 1e9).toLocaleString();
  const label = account.label || truncatePubkey(account.staker);
  return `${solAmount} SOL - ${label}`;
}

