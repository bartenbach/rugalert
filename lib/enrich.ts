import { fetchValidatorInfoFromChain } from './validatorInfo'

export async function deriveNameAndAvatar(votePubkey: string, identityPubkey?: string) {
  const rpcUrl = process.env.RPC_URL!
  let name: string | undefined
  let avatarUrl: string | undefined
  try {
    if (identityPubkey) {
      const info = await fetchValidatorInfoFromChain(rpcUrl, identityPubkey)
      if (info?.name) name = info.name
      // Only use avatarUrl if it exists in validator info (no fallback)
      avatarUrl = info?.iconUrl
    }
  } catch {}
  if (!name) name = votePubkey.slice(0,4) + '…' + votePubkey.slice(-4)
  return { name, avatarUrl }
}
