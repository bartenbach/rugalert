/**
 * Validator Client Type Detection
 * 
 * Detects which validator client software a Solana validator is running based on
 * the version string from getClusterNodes RPC (gossip).
 * 
 * Client Types (the base software):
 * - agave: Standard Agave client (formerly Solana Labs, now maintained by Anza)
 * - frankendancer: Hybrid client (Firedancer networking + Agave runtime/consensus)
 * - firedancer: Full Firedancer client (Jump's complete implementation)
 * - unknown: Could not determine client type
 * 
 * Note: Jito and BAM are NOT client types - they are features/toggles that can be
 * enabled on any client. These are tracked separately via jito_enabled and bam_enabled
 * fields in the database.
 * 
 * Version Format Reference:
 * - Agave: "1.x.x", "2.x.x", "3.x.x" (e.g., "3.0.14")
 * - Frankendancer: "0.8xx.xxxxx" (e.g., "0.808.30014")
 *   - Major: 0 (indicates Frankendancer, not full Firedancer)
 *   - Minor: 8xx (800+ for Frankendancer releases)
 *   - Patch: Encodes embedded Agave version (e.g., 30014 = v3.0.14)
 * - Firedancer: "1.x.x" (when fully released - not yet on mainnet)
 */

export type ClientType = 
  | 'agave'         // Standard Agave client
  | 'frankendancer' // Firedancer networking + Agave runtime
  | 'firedancer'    // Full Firedancer (not yet widely deployed)
  | 'unknown';      // Could not determine

export interface ClientTypeInfo {
  clientType: ClientType;
  version: string | null;
  embeddedAgaveVersion: string | null; // For Frankendancer, the embedded Agave version
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detect client type from version string
 * 
 * @param version - Version string from getClusterNodes (e.g., "3.0.14" or "0.808.30014")
 * @returns Client type and confidence level
 */
export function detectBaseClient(version: string | null | undefined): {
  clientType: ClientType;
  confidence: 'high' | 'medium' | 'low';
  embeddedAgaveVersion: string | null;
} {
  if (!version || typeof version !== 'string') {
    return { clientType: 'unknown', confidence: 'low', embeddedAgaveVersion: null };
  }

  const trimmed = version.trim();
  
  // Frankendancer detection (hybrid: Firedancer networking + Agave runtime)
  // Format: 0.8xx.xxxxx where 8xx is the minor version (800+)
  // Examples: "0.808.30014", "0.809.30106"
  // Major version 0 indicates Frankendancer (not full Firedancer)
  if (trimmed.startsWith('0.')) {
    const parts = trimmed.split('.');
    if (parts.length >= 2) {
      const minor = parseInt(parts[1], 10);
      // Frankendancer uses 800+ minor versions
      if (minor >= 800 && minor < 1000) {
        const embeddedAgave = parseFireDancerAgaveVersion(trimmed);
        return { clientType: 'frankendancer', confidence: 'high', embeddedAgaveVersion: embeddedAgave };
      }
    }
    // Other 0.x versions - likely some variant of Firedancer/Frankendancer
    return { clientType: 'frankendancer', confidence: 'medium', embeddedAgaveVersion: null };
  }

  // Full Firedancer detection (when released, will be 1.x)
  // This is speculative - full Firedancer isn't widely deployed on mainnet yet
  // We'll detect it by looking for version patterns that don't match Agave
  // For now, we assume 1.x versions are Agave unless proven otherwise
  
  // Agave detection
  // Format: X.Y.Z where X is 1, 2, or 3+
  // Examples: "1.18.22", "2.0.15", "3.0.14"
  const agaveMatch = trimmed.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (agaveMatch) {
    const major = parseInt(agaveMatch[1], 10);
    // Agave versions are 1.x, 2.x, or 3.x (and likely future versions)
    if (major >= 1 && major <= 10) {
      return { clientType: 'agave', confidence: 'high', embeddedAgaveVersion: null };
    }
  }

  // Could be a development/custom version
  return { clientType: 'unknown', confidence: 'low', embeddedAgaveVersion: null };
}

/**
 * Detect the base client type from version string
 * 
 * Note: This only detects the BASE client (agave, frankendancer, firedancer).
 * Jito and BAM are features/toggles tracked separately in the database.
 * 
 * @param version - Version string from getClusterNodes
 * @returns Client type info
 */
export function detectClientType(version: string | null | undefined): ClientTypeInfo {
  const { clientType, confidence, embeddedAgaveVersion } = detectBaseClient(version);

  return {
    clientType,
    version: version || null,
    embeddedAgaveVersion,
    confidence,
  };
}

/**
 * Parse Firedancer version to extract embedded Agave version
 * 
 * @param version - Firedancer version string (e.g., "0.808.30014")
 * @returns Embedded Agave version string or null
 */
export function parseFireDancerAgaveVersion(version: string): string | null {
  if (!version || !version.startsWith('0.')) {
    return null;
  }

  const parts = version.split('.');
  if (parts.length < 3) {
    return null;
  }

  const patch = parts[2];
  if (!patch || patch.length < 4) {
    return null;
  }

  // Patch format: AVVPP where A=major, VV=minor, PP=patch
  // e.g., 30014 = v3.0.14, 20015 = v2.0.15
  try {
    const patchNum = parseInt(patch, 10);
    const major = Math.floor(patchNum / 10000);
    const minor = Math.floor((patchNum % 10000) / 100);
    const patchVer = patchNum % 100;
    
    if (major > 0 && major < 10) {
      return `${major}.${minor}.${patchVer}`;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Get display name for a client type
 */
export function getClientTypeDisplayName(clientType: ClientType): string {
  switch (clientType) {
    case 'agave':
      return 'Agave';
    case 'frankendancer':
      return 'Frankendancer';
    case 'firedancer':
      return 'Firedancer';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

/**
 * Get color for a client type (for UI display)
 */
export function getClientTypeColor(clientType: ClientType): string {
  switch (clientType) {
    case 'agave':
      return '#14F195'; // Solana green
    case 'frankendancer':
      return '#FF6B35'; // Orange (Jump/Firedancer family)
    case 'firedancer':
      return '#FF9500'; // Yellow-orange (full Firedancer)
    case 'unknown':
    default:
      return '#6B7280'; // Gray
  }
}

/**
 * Get color for Jito badge
 */
export function getJitoBadgeColor(): string {
  return '#9945FF'; // Solana purple
}

/**
 * Get color for BAM badge
 */
export function getBamBadgeColor(): string {
  return '#E040FB'; // Pink/magenta
}

/**
 * Fetch cluster nodes from RPC and build version map
 * 
 * @param rpcUrl - Solana RPC URL
 * @returns Map of identity pubkey -> version string
 */
export async function fetchClusterNodeVersions(rpcUrl: string): Promise<Map<string, string>> {
  const versionMap = new Map<string, string>();
  
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getClusterNodes',
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
    }

    const nodes = json.result || [];
    for (const node of nodes) {
      if (node.pubkey && node.version) {
        versionMap.set(node.pubkey, node.version);
      }
    }
  } catch (error) {
    console.error('Failed to fetch cluster nodes:', error);
  }

  return versionMap;
}

/**
 * Get client type statistics from a collection of validators
 */
export function getClientTypeStats(validators: Array<{ 
  clientType: ClientType; 
  activeStake?: number;
  jitoEnabled?: boolean;
  bamEnabled?: boolean;
}>): {
  counts: Record<ClientType, number>;
  stakeByClient: Record<ClientType, number>;
  percentages: Record<ClientType, number>;
  jitoCount: number;
  bamCount: number;
  jitoStake: number;
  bamStake: number;
} {
  const counts: Record<ClientType, number> = {
    'agave': 0,
    'frankendancer': 0,
    'firedancer': 0,
    'unknown': 0,
  };
  
  const stakeByClient: Record<ClientType, number> = {
    'agave': 0,
    'frankendancer': 0,
    'firedancer': 0,
    'unknown': 0,
  };

  let totalStake = 0;
  let jitoCount = 0;
  let bamCount = 0;
  let jitoStake = 0;
  let bamStake = 0;

  for (const v of validators) {
    const ct = v.clientType || 'unknown';
    counts[ct] = (counts[ct] || 0) + 1;
    
    const stake = v.activeStake || 0;
    stakeByClient[ct] = (stakeByClient[ct] || 0) + stake;
    totalStake += stake;
    
    // Track Jito and BAM separately
    if (v.jitoEnabled) {
      jitoCount++;
      jitoStake += stake;
    }
    if (v.bamEnabled) {
      bamCount++;
      bamStake += stake;
    }
  }

  const percentages: Record<ClientType, number> = {
    'agave': 0,
    'frankendancer': 0,
    'firedancer': 0,
    'unknown': 0,
  };

  if (totalStake > 0) {
    for (const ct of Object.keys(stakeByClient) as ClientType[]) {
      percentages[ct] = (stakeByClient[ct] / totalStake) * 100;
    }
  }

  return { counts, stakeByClient, percentages, jitoCount, bamCount, jitoStake, bamStake };
}
