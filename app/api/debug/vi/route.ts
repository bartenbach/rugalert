import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'

const CONFIG_PROGRAM_ID = new PublicKey('Config1111111111111111111111111111111111111')

// Find the JSON object that contains "identityPubkey":"<id>"
function extractObjectAroundIndex(s: string, pos: number): any | null {
  // find nearest '{' to the left, then bracket-match to closing '}'
  let start = pos
  while (start >= 0 && s[start] !== '{') start--
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        const slice = s.slice(start, i + 1)
        try { return JSON.parse(slice) } catch { return null }
      }
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get('identity') || ''
  const rpcUrl = process.env.RPC_URL || ''

  // Always return JSON so you can see what’s wrong
  if (!rpcUrl) {
    return NextResponse.json({ ok: false, error: 'RPC_URL is missing from env' }, { status: 500 })
  }
  if (!idParam) {
    return NextResponse.json({ ok: false, error: 'missing ?identity=<IDENTITY_PUBKEY>' }, { status: 400 })
  }

  try {
    const identity = new PublicKey(idParam).toBase58() // normalize
    const connection = new Connection(rpcUrl, 'confirmed')
    const accounts = await connection.getProgramAccounts(CONFIG_PROGRAM_ID)

    let hits: any[] = []
    for (const a of accounts) {
      const buf = a.account.data
      if (!buf) continue
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
      const needle = `"identityPubkey":"${identity}"`
      const idx = text.indexOf(needle)
      if (idx === -1) continue
      const parsed = extractObjectAroundIndex(text, idx)
      hits.push({
        configAccount: a.pubkey.toBase58(),
        preview: text.slice(Math.max(0, idx - 100), idx + 200),
        parsed
      })
    }

    return NextResponse.json({ ok: true, hitsCount: hits.length, hits })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
