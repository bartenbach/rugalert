/**
 * Known Staker Mapping
 * 
 * Maps staker public keys to human-readable names for common delegation programs
 * and foundations.
 */

export const KNOWN_STAKERS: Record<string, string> = {
  "mpa4abUkjQoAvPzREkh5Mo75hZhPFQ2FSH6w7dWKuQ5": "Solana Foundation",
  "stWirqFCf2Uts1JBL1Jsd3r6VBWhgnpdPxCTe1MFjrq": "Marinade",
  "6WecYymEARvjG5ZyqkrVQ6YkhPfujNzWpSPwNKXHCbV2": "Jito",
  "AKJt3m2xJ6ANda9adBGqb5BMrheKJSwxyCfYkLuZNmjn": "aeroSOL",
  "3etKXcW2fzEJR5YXoSKSmP6UZ633g9uiFv5yuqFUf66k": "Socean",
  "EpH4ZKSeViL5qAHA9QANYVHxdmuzbUH2T79f32DmSCaM": "Shinobi Performance Pool",
  "4cpnpiwgBfUgELVwNYiecwGti45YHSH3R72CPkFTiwJt": "DoubleZero Delegation Program",
  "8CCr7yVngeqnyodu79FNd5qV6XT8RkU1pa8EgZynecjS": "Firedancer Delegation Program",
};

/**
 * Get a human-readable label for a staker pubkey
 */
export function getStakerLabel(stakerPubkey: string): string | null {
  return KNOWN_STAKERS[stakerPubkey] || null;
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

