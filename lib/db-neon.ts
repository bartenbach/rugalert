// lib/db-neon.ts - Neon Serverless Postgres Client
import { neon, neonConfig } from '@neondatabase/serverless'

// Configure for Vercel Edge (optional, but recommended)
neonConfig.fetchConnectionCache = true

// Initialize Neon client with connection string
const sql = neon(process.env.DATABASE_URL!)

// ============================================
// TYPES
// ============================================

export type Validator = {
  id: string
  vote_pubkey: string
  identity_pubkey?: string | null
  name?: string | null
  icon_url?: string | null
  avatar_url?: string | null
  version?: string | null
  commission: number
  active_stake: bigint
  activating_stake: bigint
  deactivating_stake: bigint
  stake_account_count: number
  delinquent: boolean
  jito_enabled: boolean
  created_at: Date
  updated_at: Date
}

export type Snapshot = {
  id: string
  key: string
  vote_pubkey: string
  epoch: number
  slot?: bigint | null
  commission?: number | null
  created_at: Date
}

export type Event = {
  id: string
  vote_pubkey: string
  type: 'RUG' | 'CAUTION' | 'INFO'
  from_commission: number
  to_commission: number
  delta: number
  epoch: number
  created_at: Date
}

export type Subscriber = {
  id: string
  email: string
  preferences: 'rugs_only' | 'all_alerts' | 'all_events'
  created_at: Date
  updated_at: Date
}

// ============================================
// CRUD OPERATIONS
// ============================================

// Validators
export async function findValidator(votePubkey: string): Promise<Validator | null> {
  const result = await sql`
    SELECT * FROM validators 
    WHERE vote_pubkey = ${votePubkey}
    LIMIT 1
  `
  return result[0] || null
}

export async function upsertValidator(
  votePubkey: string,
  identityPubkey?: string,
  name?: string,
  iconUrl?: string
): Promise<Validator> {
  const result = await sql`
    INSERT INTO validators (vote_pubkey, identity_pubkey, name, icon_url)
    VALUES (${votePubkey}, ${identityPubkey || null}, ${name || null}, ${iconUrl || null})
    ON CONFLICT (vote_pubkey) 
    DO UPDATE SET
      identity_pubkey = COALESCE(EXCLUDED.identity_pubkey, validators.identity_pubkey),
      name = COALESCE(EXCLUDED.name, validators.name),
      icon_url = COALESCE(EXCLUDED.icon_url, validators.icon_url),
      updated_at = NOW()
    RETURNING *
  `
  return result[0]
}

export async function getAllValidators(): Promise<Validator[]> {
  return await sql`SELECT * FROM validators`
}

export async function updateValidatorStake(
  votePubkey: string,
  activeStake: number,
  activatingStake: number,
  deactivatingStake: number,
  commission: number,
  stakeAccountCount: number
): Promise<void> {
  await sql`
    UPDATE validators 
    SET 
      active_stake = ${activeStake},
      activating_stake = ${activatingStake},
      deactivating_stake = ${deactivatingStake},
      commission = ${commission},
      stake_account_count = ${stakeAccountCount},
      updated_at = NOW()
    WHERE vote_pubkey = ${votePubkey}
  `
}

// Snapshots
export async function getPrevSnapshot(votePubkey: string, currentEpoch: number): Promise<Snapshot | null> {
  const result = await sql`
    SELECT * FROM snapshots
    WHERE vote_pubkey = ${votePubkey} AND epoch < ${currentEpoch}
    ORDER BY epoch DESC
    LIMIT 1
  `
  return result[0] || null
}

export async function upsertSnapshot(
  votePubkey: string,
  epoch: number,
  fields: { slot?: number; commission?: number }
): Promise<Snapshot> {
  const key = `${votePubkey}-${epoch}`
  const result = await sql`
    INSERT INTO snapshots (key, vote_pubkey, epoch, slot, commission)
    VALUES (${key}, ${votePubkey}, ${epoch}, ${fields.slot || null}, ${fields.commission || null})
    ON CONFLICT (key) 
    DO UPDATE SET
      slot = COALESCE(EXCLUDED.slot, snapshots.slot),
      commission = COALESCE(EXCLUDED.commission, snapshots.commission)
    RETURNING *
  `
  return result[0]
}

// Events
export async function createEvent(
  votePubkey: string,
  type: 'RUG' | 'CAUTION' | 'INFO',
  fromCommission: number,
  toCommission: number,
  delta: number,
  epoch: number
): Promise<Event> {
  const result = await sql`
    INSERT INTO events (vote_pubkey, type, from_commission, to_commission, delta, epoch)
    VALUES (${votePubkey}, ${type}, ${fromCommission}, ${toCommission}, ${delta}, ${epoch})
    RETURNING *
  `
  return result[0]
}

export async function listEventsSince(minEpoch: number): Promise<Event[]> {
  return await sql`
    SELECT DISTINCT ON (vote_pubkey) *
    FROM events
    WHERE epoch >= ${minEpoch}
    ORDER BY vote_pubkey, epoch DESC, created_at DESC
  `
}

export async function getEventsInEpochRange(minEpoch: number, maxEpoch: number): Promise<Event[]> {
  return await sql`
    SELECT * FROM events
    WHERE epoch >= ${minEpoch} AND epoch <= ${maxEpoch}
    ORDER BY created_at DESC
  `
}

// Subscribers
export async function findSubscriber(email: string): Promise<Subscriber | null> {
  const result = await sql`
    SELECT * FROM subscribers 
    WHERE email = ${email}
    LIMIT 1
  `
  return result[0] || null
}

export async function upsertSubscriber(email: string, preferences: string): Promise<Subscriber> {
  const result = await sql`
    INSERT INTO subscribers (email, preferences)
    VALUES (${email}, ${preferences})
    ON CONFLICT (email) 
    DO UPDATE SET
      preferences = EXCLUDED.preferences,
      updated_at = NOW()
    RETURNING *
  `
  return result[0]
}

export async function getAllSubscribers(): Promise<Subscriber[]> {
  return await sql`SELECT * FROM subscribers`
}

// Series for charting
export async function seriesFor(votePubkey: string): Promise<{ epoch: number; commission: number }[]> {
  const result = await sql`
    SELECT epoch, commission
    FROM snapshots
    WHERE vote_pubkey = ${votePubkey}
    ORDER BY epoch ASC
  `
  return result.map((r: any) => ({
    epoch: r.epoch,
    commission: r.commission || 0,
  }))
}

// MEV Snapshots
export async function getLatestMevCommissions(votePubkeys: string[]): Promise<Map<string, number>> {
  if (votePubkeys.length === 0) return new Map()
  
  const result = await sql`
    SELECT DISTINCT ON (vote_pubkey) vote_pubkey, mev_commission
    FROM mev_snapshots
    WHERE vote_pubkey = ANY(${votePubkeys})
    ORDER BY vote_pubkey, epoch DESC
  `
  
  const map = new Map<string, number>()
  for (const row of result) {
    if (row.mev_commission !== null) {
      map.set(row.vote_pubkey, row.mev_commission)
    }
  }
  return map
}

// Daily Uptime
export async function getUptimeData(
  votePubkeys: string[], 
  days: number = 7
): Promise<Map<string, { totalChecks: number; delinquentChecks: number; days: number }>> {
  if (votePubkeys.length === 0) return new Map()
  
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  const cutoffStr = cutoffDate.toISOString().split('T')[0]
  
  const result = await sql`
    SELECT 
      vote_pubkey,
      SUM(uptime_checks) as total_checks,
      SUM(delinquent_checks) as delinquent_checks,
      COUNT(*) as days
    FROM daily_uptime
    WHERE vote_pubkey = ANY(${votePubkeys})
      AND date >= ${cutoffStr}
    GROUP BY vote_pubkey
  `
  
  const map = new Map()
  for (const row of result) {
    map.set(row.vote_pubkey, {
      totalChecks: Number(row.total_checks || 0),
      delinquentChecks: Number(row.delinquent_checks || 0),
      days: Number(row.days || 0),
    })
  }
  return map
}

// Stake History
export async function upsertStakeHistory(
  votePubkey: string,
  epoch: number,
  data: {
    slot?: number
    active_stake?: number
    activating_stake?: number
    deactivating_stake?: number
    credits_observed?: number
  }
): Promise<void> {
  const key = `${votePubkey}-${epoch}`
  await sql`
    INSERT INTO stake_history (
      key, vote_pubkey, epoch, slot, active_stake, 
      activating_stake, deactivating_stake, credits_observed
    )
    VALUES (
      ${key}, ${votePubkey}, ${epoch}, ${data.slot || null}, 
      ${data.active_stake || 0}, ${data.activating_stake || 0}, 
      ${data.deactivating_stake || 0}, ${data.credits_observed || null}
    )
    ON CONFLICT (key) DO NOTHING
  `
}

// Performance History
export async function upsertPerformanceHistory(
  votePubkey: string,
  epoch: number,
  data: {
    slot?: number
    credits_earned?: number
    credits_observed?: number
  }
): Promise<void> {
  const key = `${votePubkey}-${epoch}`
  await sql`
    INSERT INTO performance_history (
      key, vote_pubkey, epoch, slot, credits_earned, credits_observed
    )
    VALUES (
      ${key}, ${votePubkey}, ${epoch}, ${data.slot || null},
      ${data.credits_earned || null}, ${data.credits_observed || null}
    )
    ON CONFLICT (key) DO NOTHING
  `
}

// MEV Snapshots
export async function upsertMevSnapshot(
  votePubkey: string,
  epoch: number,
  mevCommission: number
): Promise<void> {
  const key = `${votePubkey}-${epoch}`
  await sql`
    INSERT INTO mev_snapshots (key, vote_pubkey, epoch, mev_commission)
    VALUES (${key}, ${votePubkey}, ${epoch}, ${mevCommission})
    ON CONFLICT (key) 
    DO UPDATE SET mev_commission = EXCLUDED.mev_commission
  `
}

// Daily Uptime
export async function upsertDailyUptime(
  votePubkey: string,
  date: string,
  uptimeChecks: number,
  delinquentChecks: number
): Promise<void> {
  const key = `${votePubkey}-${date}`
  await sql`
    INSERT INTO daily_uptime (key, vote_pubkey, date, uptime_checks, delinquent_checks)
    VALUES (${key}, ${votePubkey}, ${date}, ${uptimeChecks}, ${delinquentChecks})
    ON CONFLICT (key) 
    DO UPDATE SET
      uptime_checks = EXCLUDED.uptime_checks,
      delinquent_checks = EXCLUDED.delinquent_checks
  `
}

// Export the sql client for raw queries if needed
export { sql }

