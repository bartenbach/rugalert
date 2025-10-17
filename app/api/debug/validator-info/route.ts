import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'

const CONFIG_PROGRAM_ID = new PublicKey('Config1111111111111111111111111111111111111')

function extractObjectAroundIndex(s: string, pos: number): any | null {
  // find nearest '{' to the left, then bracket-match to find its closing '}'
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
  const identity = req.nextUrl.searchParams.get('identity')
  if (!identity) return NextResponse.json({ error: 'missing identity' }, { status: 400 })
  try {
    const connection = new Connection(process.env.RPC_URL!, 'confirmed')
    const accounts = await connection.getProgramAccounts(CONFIG_PROGRAM_ID)

    const id58 = new PublicKey(identity).toBase58()
    const hits: any[] = []
    for (const a of accounts) {
      const data = a.account.data
      if (!data) continue
      const text = new TextDecoder('utf-8', { fatal: false }).decode(data)
      const needle = `"identityPubkey":"${id58}"`
      const idx = text.indexOf(needle)
      if (idx === -1) continue
      const obj = extractObjectAroundIndex(text, idx)
      hits.push({ pubkey: a.pubkey.toBase58(), parsed: obj, rawPreview: text.slice(Math.max(0, idx - 120), idx + 120) })
    }

    return NextResponse.json({ hitsCount: hits.length, hits })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
