// lib/db.ts - PostgreSQL/Supabase Database Client
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for server-side

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

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
  active_stake: number
  activating_stake: number
  deactivating_stake: number
  stake_account_count: number
  delinquent: boolean
  jito_enabled: boolean
  created_at: string
  updated_at: string
}

export type Snapshot = {
  id: string
  key: string
  vote_pubkey: string
  epoch: number
  slot?: number | null
  commission?: number | null
  created_at: string
}

export type Event = {
  id: string
  vote_pubkey: string
  type: 'RUG' | 'CAUTION' | 'INFO'
  from_commission: number
  to_commission: number
  delta: number
  epoch: number
  created_at: string
}

export type Subscriber = {
  id: string
  email: string
  preferences: 'rugs_only' | 'all_alerts' | 'all_events'
  created_at: string
  updated_at: string
}

// ============================================
// CRUD OPERATIONS
// ============================================

// Validators
export async function findValidator(votePubkey: string): Promise<Validator | null> {
  const { data, error } = await supabase
    .from('validators')
    .select('*')
    .eq('vote_pubkey', votePubkey)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }
  return data
}

export async function upsertValidator(
  votePubkey: string,
  identityPubkey?: string,
  name?: string,
  iconUrl?: string
): Promise<Validator> {
  const { data, error } = await supabase
    .from('validators')
    .upsert({
      vote_pubkey: votePubkey,
      identity_pubkey: identityPubkey,
      name,
      icon_url: iconUrl,
    }, {
      onConflict: 'vote_pubkey',
    })
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function getAllValidators(): Promise<Validator[]> {
  const { data, error } = await supabase
    .from('validators')
    .select('*')
  
  if (error) throw error
  return data || []
}

// Snapshots
export async function getPrevSnapshot(votePubkey: string, currentEpoch: number): Promise<Snapshot | null> {
  const { data, error } = await supabase
    .from('snapshots')
    .select('*')
    .eq('vote_pubkey', votePubkey)
    .lt('epoch', currentEpoch)
    .order('epoch', { ascending: false })
    .limit(1)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }
  return data
}

export async function upsertSnapshot(
  votePubkey: string,
  epoch: number,
  fields: { slot?: number; commission?: number }
): Promise<Snapshot> {
  const key = `${votePubkey}-${epoch}`
  const { data, error } = await supabase
    .from('snapshots')
    .upsert({
      key,
      vote_pubkey: votePubkey,
      epoch,
      ...fields,
    }, {
      onConflict: 'key',
    })
    .select()
    .single()
  
  if (error) throw error
  return data
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
  const { data, error } = await supabase
    .from('events')
    .insert({
      vote_pubkey: votePubkey,
      type,
      from_commission: fromCommission,
      to_commission: toCommission,
      delta,
      epoch,
    })
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function listEventsSince(minEpoch: number): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('epoch', minEpoch)
    .order('epoch', { ascending: false })
  
  if (error) throw error
  
  // Keep the newest per votePubkey (client-side for now, can optimize with SQL)
  const byKey = new Map<string, Event>()
  for (const event of data || []) {
    if (!byKey.has(event.vote_pubkey)) {
      byKey.set(event.vote_pubkey, event)
    }
  }
  return Array.from(byKey.values())
}

export async function getEventsInEpochRange(minEpoch: number, maxEpoch: number): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('epoch', minEpoch)
    .lte('epoch', maxEpoch)
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data || []
}

// Subscribers
export async function findSubscriber(email: string): Promise<Subscriber | null> {
  const { data, error } = await supabase
    .from('subscribers')
    .select('*')
    .eq('email', email)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}

export async function upsertSubscriber(email: string, preferences: string): Promise<Subscriber> {
  const { data, error } = await supabase
    .from('subscribers')
    .upsert({
      email,
      preferences,
    }, {
      onConflict: 'email',
    })
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function getAllSubscribers(): Promise<Subscriber[]> {
  const { data, error } = await supabase
    .from('subscribers')
    .select('*')
  
  if (error) throw error
  return data || []
}

// Series for charting
export async function seriesFor(votePubkey: string): Promise<{ epoch: number; commission: number }[]> {
  const { data, error } = await supabase
    .from('snapshots')
    .select('epoch, commission')
    .eq('vote_pubkey', votePubkey)
    .order('epoch', { ascending: true })
  
  if (error) throw error
  return (data || []).map(r => ({
    epoch: r.epoch,
    commission: r.commission || 0,
  }))
}

// MEV Snapshots
export async function getLatestMevCommissions(votePubkeys: string[]): Promise<Map<string, number>> {
  if (votePubkeys.length === 0) return new Map()
  
  // Get latest MEV commission for each validator
  // We'll use a subquery to get the latest epoch per validator
  const { data, error } = await supabase
    .from('mev_snapshots')
    .select('vote_pubkey, mev_commission, epoch')
    .in('vote_pubkey', votePubkeys)
    .order('epoch', { ascending: false })
  
  if (error) throw error
  
  // Keep only the latest per validator
  const map = new Map<string, number>()
  for (const row of data || []) {
    if (!map.has(row.vote_pubkey) && row.mev_commission !== null) {
      map.set(row.vote_pubkey, row.mev_commission)
    }
  }
  return map
}

// Daily Uptime
export async function getUptimeData(votePubkeys: string[], days: number = 7): Promise<Map<string, { totalChecks: number; delinquentChecks: number; days: number }>> {
  if (votePubkeys.length === 0) return new Map()
  
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  
  const { data, error } = await supabase
    .from('daily_uptime')
    .select('vote_pubkey, uptime_checks, delinquent_checks')
    .in('vote_pubkey', votePubkeys)
    .gte('date', cutoffDate.toISOString().split('T')[0])
  
  if (error) throw error
  
  // Aggregate per validator
  const map = new Map<string, { totalChecks: number; delinquentChecks: number; days: number }>()
  for (const row of data || []) {
    const existing = map.get(row.vote_pubkey)
    if (existing) {
      existing.totalChecks += row.uptime_checks || 0
      existing.delinquentChecks += row.delinquent_checks || 0
      existing.days += 1
    } else {
      map.set(row.vote_pubkey, {
        totalChecks: row.uptime_checks || 0,
        delinquentChecks: row.delinquent_checks || 0,
        days: 1,
      })
    }
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
  const { error } = await supabase
    .from('stake_history')
    .upsert({
      key,
      vote_pubkey: votePubkey,
      epoch,
      ...data,
    }, {
      onConflict: 'key',
    })
  
  if (error) throw error
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
  const { error } = await supabase
    .from('performance_history')
    .upsert({
      key,
      vote_pubkey: votePubkey,
      epoch,
      ...data,
    }, {
      onConflict: 'key',
    })
  
  if (error) throw error
}

// MEV Snapshots
export async function upsertMevSnapshot(
  votePubkey: string,
  epoch: number,
  mevCommission: number
): Promise<void> {
  const key = `${votePubkey}-${epoch}`
  const { error } = await supabase
    .from('mev_snapshots')
    .upsert({
      key,
      vote_pubkey: votePubkey,
      epoch,
      mev_commission: mevCommission,
    }, {
      onConflict: 'key',
    })
  
  if (error) throw error
}

// Daily Uptime
export async function upsertDailyUptime(
  votePubkey: string,
  date: string,
  uptimeChecks: number,
  delinquentChecks: number
): Promise<void> {
  const key = `${votePubkey}-${date}`
  const { error } = await supabase
    .from('daily_uptime')
    .upsert({
      key,
      vote_pubkey: votePubkey,
      date,
      uptime_checks: uptimeChecks,
      delinquent_checks: delinquentChecks,
    }, {
      onConflict: 'key',
    })
  
  if (error) throw error
}

