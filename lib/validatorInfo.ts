import { Connection, PublicKey } from '@solana/web3.js';

/**
 * Read the on-chain validator-info account for a given infoPubkey.
 * Works with Helius or any RPC that supports encoding:"jsonParsed".
 */
export async function fetchValidatorInfoFromChain(
  rpcUrl: string,
  infoPubkey: string
): Promise<{ name?: string; iconUrl?: string; website?: string; details?: string } | null> {
  try {
    const conn = new Connection(rpcUrl, 'confirmed')
    const pk = new PublicKey(infoPubkey)
    const res: any = await conn.getAccountInfo(pk, 'confirmed')
    if (!res || !res.data) return null

    // Helius returns { parsed: { info: { configData: {...} } } }
    const cfg = res.data.parsed?.info?.configData
    if (!cfg) return null

    return {
      name: cfg.name,
      iconUrl: cfg.iconUrl,
      website: cfg.website,
      details: cfg.details,
    }
  } catch (e) {
    console.error('validator-info fetch failed', e)
    return null
  }
}