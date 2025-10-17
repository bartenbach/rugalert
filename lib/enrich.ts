import { fetchValidatorInfoFromChain } from './validatorInfo'

export async function deriveNameAndAvatar(votePubkey: string, identityPubkey?: string) {
  const rpcUrl = process.env.RPC_URL!
  let name: string | undefined
  try {
    if (identityPubkey) {
      const info = await fetchValidatorInfoFromChain(rpcUrl, identityPubkey)
      if (info?.name) name = info.name
    }
  } catch {}
  if (!name) name = votePubkey.slice(0,4) + '…' + votePubkey.slice(-4)
  const seed = identityPubkey || votePubkey
  const avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(seed)}`
  return { name, avatarUrl }
}
