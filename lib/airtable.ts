// lib/airtable.ts
import Airtable from 'airtable'

/**
 * ENV required:
 * - AIRTABLE_API_KEY
 * - AIRTABLE_BASE_ID
 * Optional (but set these to your actual table names if you changed them):
 * - AIRTABLE_TB_VALIDATORS (default: 'validators')
 * - AIRTABLE_TB_SNAPSHOTS  (default: 'snapshots')
 * - AIRTABLE_TB_EVENTS     (default: 'events')
 * - AIRTABLE_TB_SUBSCRIBERS(default: 'subscribers')
 */

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY! }).base(
  process.env.AIRTABLE_BASE_ID!
)

const TB_VALIDATORS = process.env.AIRTABLE_TB_VALIDATORS || 'validators'
const TB_SNAPSHOTS  = process.env.AIRTABLE_TB_SNAPSHOTS  || 'snapshots'
const TB_EVENTS     = process.env.AIRTABLE_TB_EVENTS     || 'events'
const TB_SUBS       = process.env.AIRTABLE_TB_SUBSCRIBERS|| 'subscribers'
const TB_STAKE_HISTORY = process.env.AIRTABLE_TB_STAKE_HISTORY || 'stake_history'
const TB_PERFORMANCE_HISTORY = process.env.AIRTABLE_TB_PERFORMANCE_HISTORY || 'performance_history'
const TB_MEV_SNAPSHOTS = process.env.AIRTABLE_TB_MEV_SNAPSHOTS || 'mev_snapshots'
const TB_MEV_EVENTS = process.env.AIRTABLE_TB_MEV_EVENTS || 'mev_events'
const TB_DAILY_UPTIME = process.env.AIRTABLE_TB_DAILY_UPTIME || 'daily_uptime'

export const tb = {
  validators: base(TB_VALIDATORS),
  snapshots:  base(TB_SNAPSHOTS),
  events:     base(TB_EVENTS),
  subs:       base(TB_SUBS),
  stakeHistory: base(TB_STAKE_HISTORY),
  performanceHistory: base(TB_PERFORMANCE_HISTORY),
  mevSnapshots: base(TB_MEV_SNAPSHOTS),
  mevEvents: base(TB_MEV_EVENTS),
  dailyUptime: base(TB_DAILY_UPTIME),
}

// ---------- Utilities ----------

async function selectOneByFormula(tbl: Airtable.Table<any>, formula: string) {
  const page = await tbl.select({ filterByFormula: formula, maxRecords: 1 }).firstPage()
  return page[0] || null
}

async function selectAll(tbl: Airtable.Table<any>, opts: Airtable.SelectOptions<any>) {
  const out: Airtable.Record<any>[] = []
  await tbl.select(opts).eachPage((records, fetchNextPage) => {
    out.push(...records)
    fetchNextPage()
  })
  return out
}

// ---------- CRUD helpers we use elsewhere ----------

export async function findValidator(votePubkey: string) {
  // Field names are case-sensitive; must match your Airtable columns exactly.
  return selectOneByFormula(tb.validators, `{votePubkey} = "${votePubkey}"`)
}

export async function upsertValidator(
  votePubkey: string,
  identityPubkey?: string,
  name?: string,
  avatarUrl?: string
) {
  const existing = await findValidator(votePubkey)
  if (existing) {
    const patch: Record<string, any> = {}
    if (identityPubkey && existing.get('identityPubkey') !== identityPubkey) patch.identityPubkey = identityPubkey
    if (name && existing.get('name') !== name) patch.name = name
    if (avatarUrl && existing.get('avatarUrl') !== avatarUrl) patch.avatarUrl = avatarUrl
    if (Object.keys(patch).length) await tb.validators.update(existing.id, patch)
    return existing
  }
  const [rec] = await tb.validators.create([{ fields: { votePubkey, identityPubkey, name, avatarUrl } }])
  return rec
}

export async function getPrevSnapshot(votePubkey: string, currentEpoch: number) {
  const page = await tb.snapshots.select({
    filterByFormula: `AND({votePubkey} = "${votePubkey}", {epoch} < ${currentEpoch})`,
    sort: [{ field: 'epoch', direction: 'desc' }],
    maxRecords: 1,
  }).firstPage()
  return page[0] || null
}

export async function upsertSnapshot(
  votePubkey: string,
  epoch: number,
  fields: { slot?: number; commission?: number }
) {
  const key = `${votePubkey}-${epoch}`
  const existing = await selectOneByFormula(tb.snapshots, `{key} = "${key}"`)
  if (existing) {
    await tb.snapshots.update(existing.id, fields)
    return existing
  }
  const [rec] = await tb.snapshots.create([{ fields: { key, votePubkey, epoch, ...fields } }])
  return rec
}

/**
 * Return the latest event per validator since minEpoch.
 */
export async function listEventsSince(minEpoch: number) {
  const all = await selectAll(tb.events, {
    filterByFormula: `{epoch} >= ${minEpoch}`,
    sort: [{ field: 'epoch', direction: 'desc' }],
    pageSize: 100,
  })

  // Keep the newest per votePubkey
  const byKey = new Map<string, Airtable.Record<any>>()
  for (const r of all) {
    const vp = r.get('votePubkey') as string
    if (!byKey.has(vp)) byKey.set(vp, r)
  }
  return Array.from(byKey.values())
}

export async function pagedRugs(page: number, pageSize: number) {
  const all = await selectAll(tb.events, {
    filterByFormula: `{type} = "RUG"`,
    sort: [{ field: 'epoch', direction: 'desc' }],
    pageSize: 100,
  })
  const total = all.length
  const start = Math.max(0, (page - 1) * pageSize)
  const items = all.slice(start, start + pageSize)
  return { items, total }
}

export async function pagedEvents(page: number, pageSize: number) {
  const all = await selectAll(tb.events, {
    sort: [{ field: 'epoch', direction: 'desc' }],
    pageSize: 100,
  })
  const total = all.length
  const start = Math.max(0, (page - 1) * pageSize)
  const items = all.slice(start, start + pageSize)
  return { items, total }
}

export async function seriesFor(votePubkey: string) {
  const all = await selectAll(tb.snapshots, {
    filterByFormula: `{votePubkey} = "${votePubkey}"`,
    sort: [{ field: 'epoch', direction: 'asc' }],
    pageSize: 100,
  })
  return all.map(r => ({
    epoch: r.get('epoch') as number,
    commission: r.get('commission') as number,
  }))
}
