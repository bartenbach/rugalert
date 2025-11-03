/**
 * Jito MEV Integration
 * 
 * Helpers for tracking Jito-enabled validators and their MEV commission rates.
 * 
 * Jito Resources:
 * - API: https://kobe.mainnet.jito.network/api/v1/validators
 * - Tip Payment Program: T1pyyaTNZsKv2WcRAB8oVnk93mLJw2XzjtVYqCsaHqt
 * - Tip Distribution Program: 4R3gSG8BpU4t19KYj8CfnbtRpnT8gtk4dvTHxVRwc2r7
 * - Jito RPC: https://mainnet.block-engine.jito.wtf
 */

const JITO_API_URL = 'https://kobe.mainnet.jito.network/api/v1/validators';

interface JitoApiValidator {
  vote_account: string;
  mev_commission_bps: number | null;
  mev_rewards: number;
  priority_fee_commission_bps: number;
  priority_fee_rewards: number;
  running_jito: boolean;
  active_stake: number;
}

interface JitoValidatorInfo {
  isJitoEnabled: boolean;
  mevCommission: number | null; // Percentage (0-100)
  priorityFeeCommission: number | null; // Percentage (0-100)
  mevRewards: number;
  priorityFeeRewards: number;
}

/**
 * Fetch all Jito validators and their MEV commission rates
 * Returns a Map of votePubkey -> JitoValidatorInfo
 */
export async function fetchAllJitoValidators(): Promise<Map<string, JitoValidatorInfo>> {
  try {
    console.log('📡 Fetching Jito validators from API...');
    const response = await fetch(JITO_API_URL);
    
    if (!response.ok) {
      throw new Error(`Jito API returned ${response.status}`);
    }
    
    const data = await response.json() as { validators: JitoApiValidator[] };
    const jitoMap = new Map<string, JitoValidatorInfo>();
    
    for (const validator of data.validators) {
      if (validator.running_jito) {
        jitoMap.set(validator.vote_account, {
          isJitoEnabled: true,
          // Convert basis points to percentage: 800 bps = 8%
          mevCommission: validator.mev_commission_bps !== null 
            ? validator.mev_commission_bps / 100 
            : null,
          priorityFeeCommission: validator.priority_fee_commission_bps / 100,
          mevRewards: validator.mev_rewards,
          priorityFeeRewards: validator.priority_fee_rewards,
        });
      }
    }
    
    console.log(`✅ Found ${jitoMap.size} Jito validators`);
    return jitoMap;
  } catch (error) {
    console.error('❌ Error fetching Jito validators:', error);
    return new Map();
  }
}

/**
 * Check if a specific validator is Jito-enabled and get their MEV commission
 */
export async function checkJitoValidator(
  votePubkey: string
): Promise<JitoValidatorInfo> {
  try {
    const jitoValidators = await fetchAllJitoValidators();
    const info = jitoValidators.get(votePubkey);
    
    if (info) {
      return info;
    }
    
    return {
      isJitoEnabled: false,
      mevCommission: null,
      priorityFeeCommission: null,
      mevRewards: 0,
      priorityFeeRewards: 0,
    };
  } catch (error) {
    console.error(`Error checking Jito status for ${votePubkey}:`, error);
    return {
      isJitoEnabled: false,
      mevCommission: null,
      priorityFeeCommission: null,
      mevRewards: 0,
      priorityFeeRewards: 0,
    };
  }
}

/**
 * Detect MEV rug - similar logic to regular commission rugs
 * 
 * Special case: fromCommission can be NULL when MEV was disabled
 * NULL → 100% is CAUTION (not RUG) because stakers weren't earning MEV rewards before
 */
export function detectMevRug(
  fromCommission: number | null,
  toCommission: number | null
): 'RUG' | 'CAUTION' | 'INFO' {
  // Handle NULL (MEV disabled) cases
  if (fromCommission === null && toCommission !== null) {
    // Enabling MEV: NULL → X%
    if (toCommission >= 90) {
      // MEV Disabled → 90%+: CAUTION (not RUG, because no rewards were being earned before)
      // This is similar to a new validator starting at 100%
      return 'CAUTION';
    }
    return 'INFO';
  }
  
  if (fromCommission !== null && toCommission === null) {
    // Disabling MEV: X% → NULL
    // This is INFO (stakers lose MEV rewards, but validator isn't taking more)
    return 'INFO';
  }
  
  // Both NULL (shouldn't happen, but handle gracefully)
  if (fromCommission === null && toCommission === null) {
    return 'INFO';
  }
  
  // Normal case: both are numbers
  const delta = toCommission! - fromCommission!;
  
  // MEV RUG: Increased TO 90% or higher (from a non-NULL commission)
  if (toCommission! >= 90 && delta > 0) {
    return 'RUG';
  }
  
  // MEV CAUTION: Increased by 20+ percentage points
  // (MEV commission changes are more volatile, so higher threshold)
  if (delta >= 20) {
    return 'CAUTION';
  }
  
  // INFO: All other changes
  return 'INFO';
}

/**
 * Calculate effective commission considering both regular and MEV
 * 
 * @param regularCommission - Regular staking commission (0-100)
 * @param mevCommission - MEV commission (0-100)
 * @param mevRatio - Ratio of MEV rewards to total rewards (0-1, typically 0.1-0.3)
 * @returns Weighted average effective commission
 */
export function calculateEffectiveCommission(
  regularCommission: number,
  mevCommission: number,
  mevRatio: number = 0.2 // Default: MEV is 20% of total rewards
): number {
  const stakingRatio = 1 - mevRatio;
  const effectiveCommission = 
    (regularCommission * stakingRatio) + (mevCommission * mevRatio);
  
  return Math.round(effectiveCommission * 100) / 100;
}

/**
 * Get Jito API URL
 */
export function getJitoApiUrl(): string {
  return JITO_API_URL;
}

