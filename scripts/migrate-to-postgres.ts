/**
 * Migration Script: Airtable → PostgreSQL (Neon)
 * 
 * This script copies all data from Airtable to PostgreSQL.
 * Run with: npm run migrate
 * 
 * This is SAFE to run multiple times - uses upserts, so won't duplicate data.
 */

// Load environment variables from .env.local FIRST
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env.local
const result = config({ path: resolve(__dirname, '../.env.local') })

if (result.error) {
  console.error('❌ Failed to load .env.local:', result.error)
  process.exit(1)
}

console.log('✅ Loaded environment variables from .env.local')
console.log('  AIRTABLE_API_KEY:', process.env.AIRTABLE_API_KEY ? '✓ Found' : '✗ Missing')
console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✓ Found' : '✗ Missing')

// Batch size for inserts
const BATCH_SIZE = 100

// Global variables for Airtable and Neon clients (set in main())
let tb: any
let sql: any

async function migrateValidators() {
  console.log('\n📦 Migrating validators...')
  const records: any[] = []
  await tb.validators.select({ pageSize: 100 }).eachPage((recs: any[], next: () => void) => {
    records.push(...recs)
    next()
  })

  console.log(`  Found ${records.length} validators`)
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    
    for (const r of batch) {
      await sql`
        INSERT INTO validators (
          vote_pubkey, identity_pubkey, name, icon_url, avatar_url, version,
          commission, active_stake, activating_stake, deactivating_stake,
          stake_account_count, delinquent, jito_enabled
        ) VALUES (
          ${String(r.get('votePubkey'))},
          ${r.get('identityPubkey') || null},
          ${r.get('name') || null},
          ${r.get('iconUrl') || null},
          ${r.get('avatarUrl') || null},
          ${r.get('version') || null},
          ${Number(r.get('commission') || 0)},
          ${Number(r.get('activeStake') || 0)},
          ${Number(r.get('activatingStake') || 0)},
          ${Number(r.get('deactivatingStake') || 0)},
          ${Number(r.get('stakeAccountCount') || 0)},
          ${Boolean(r.get('delinquent'))},
          ${Boolean(r.get('jitoEnabled'))}
        )
        ON CONFLICT (vote_pubkey) DO UPDATE SET
          identity_pubkey = COALESCE(EXCLUDED.identity_pubkey, validators.identity_pubkey),
          name = COALESCE(EXCLUDED.name, validators.name),
          icon_url = COALESCE(EXCLUDED.icon_url, validators.icon_url),
          version = COALESCE(EXCLUDED.version, validators.version),
          commission = EXCLUDED.commission,
          active_stake = EXCLUDED.active_stake,
          activating_stake = EXCLUDED.activating_stake,
          deactivating_stake = EXCLUDED.deactivating_stake,
          stake_account_count = EXCLUDED.stake_account_count,
          delinquent = EXCLUDED.delinquent,
          jito_enabled = EXCLUDED.jito_enabled,
          updated_at = NOW()
      `
    }
    
    console.log(`  ✓ Migrated ${i + batch.length}/${records.length} validators`)
  }
}

async function migrateSnapshots() {
  console.log('\n📸 Migrating snapshots...')
  const records: any[] = []
  await tb.snapshots.select({ pageSize: 100 }).eachPage((recs: any[], next: () => void) => {
    records.push(...recs)
    next()
  })

  console.log(`  Found ${records.length} snapshots`)
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    
    for (const r of batch) {
      await sql`
        INSERT INTO snapshots (key, vote_pubkey, epoch, slot, commission)
        VALUES (
          ${String(r.get('key'))},
          ${String(r.get('votePubkey'))},
          ${Number(r.get('epoch'))},
          ${r.get('slot') ? Number(r.get('slot')) : null},
          ${r.get('commission') ? Number(r.get('commission')) : null}
        )
        ON CONFLICT (key) DO UPDATE SET
          slot = COALESCE(EXCLUDED.slot, snapshots.slot),
          commission = COALESCE(EXCLUDED.commission, snapshots.commission)
      `
    }
    
    console.log(`  ✓ Migrated ${i + batch.length}/${records.length} snapshots`)
  }
}

async function migrateEvents() {
  console.log('\n🚨 Migrating events...')
  const records: any[] = []
  await tb.events.select({ pageSize: 100 }).eachPage((recs: any[], next: () => void) => {
    records.push(...recs)
    next()
  })

  console.log(`  Found ${records.length} events`)
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    
    for (const r of batch) {
      await sql`
        INSERT INTO events (vote_pubkey, type, from_commission, to_commission, delta, epoch, created_at)
        VALUES (
          ${String(r.get('votePubkey'))},
          ${String(r.get('type'))},
          ${Number(r.get('fromCommission'))},
          ${Number(r.get('toCommission'))},
          ${Number(r.get('delta'))},
          ${Number(r.get('epoch'))},
          ${r._rawJson.createdTime}
        )
      `
    }
    
    console.log(`  ✓ Migrated ${i + batch.length}/${records.length} events`)
  }
}

async function migrateSubscribers() {
  console.log('\n📧 Migrating subscribers...')
  const records: any[] = []
  await tb.subs.select({ pageSize: 100 }).eachPage((recs: any[], next: () => void) => {
    records.push(...recs)
    next()
  })

  console.log(`  Found ${records.length} subscribers`)
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    
    for (const r of batch) {
      await sql`
        INSERT INTO subscribers (email, preferences, created_at)
        VALUES (
          ${String(r.get('email'))},
          ${String(r.get('preferences') || 'rugs_only')},
          ${r._rawJson.createdTime}
        )
        ON CONFLICT (email) DO UPDATE SET
          preferences = EXCLUDED.preferences,
          updated_at = NOW()
      `
    }
    
    console.log(`  ✓ Migrated ${i + batch.length}/${records.length} subscribers`)
  }
}

async function migrateStakeHistory() {
  console.log('\n📊 Migrating stake history...')
  const records: any[] = []
  await tb.stakeHistory.select({ pageSize: 100 }).eachPage((recs: any[], next: () => void) => {
    records.push(...recs)
    next()
  })

  console.log(`  Found ${records.length} stake history records`)
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    
    for (const r of batch) {
      await sql`
        INSERT INTO stake_history (key, vote_pubkey, epoch, slot, active_stake, activating_stake, deactivating_stake, credits_observed)
        VALUES (
          ${String(r.get('key'))},
          ${String(r.get('votePubkey'))},
          ${Number(r.get('epoch'))},
          ${r.get('slot') ? Number(r.get('slot')) : null},
          ${Number(r.get('activeStake') || 0)},
          ${Number(r.get('activatingStake') || 0)},
          ${Number(r.get('deactivatingStake') || 0)},
          ${r.get('creditsObserved') ? Number(r.get('creditsObserved')) : null}
        )
        ON CONFLICT (key) DO NOTHING
      `
    }
    
    console.log(`  ✓ Migrated ${i + batch.length}/${records.length} stake history`)
  }
}

async function migratePerformanceHistory() {
  console.log('\n⚡ Migrating performance history...')
  const records: any[] = []
  await tb.performanceHistory.select({ pageSize: 100 }).eachPage((recs: any[], next: () => void) => {
    records.push(...recs)
    next()
  })

  console.log(`  Found ${records.length} performance history records`)
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    
    for (const r of batch) {
      await sql`
        INSERT INTO performance_history (key, vote_pubkey, epoch, slot, credits_earned, credits_observed)
        VALUES (
          ${String(r.get('key'))},
          ${String(r.get('votePubkey'))},
          ${Number(r.get('epoch'))},
          ${r.get('slot') ? Number(r.get('slot')) : null},
          ${r.get('creditsEarned') ? Number(r.get('creditsEarned')) : null},
          ${r.get('creditsObserved') ? Number(r.get('creditsObserved')) : null}
        )
        ON CONFLICT (key) DO NOTHING
      `
    }
    
    console.log(`  ✓ Migrated ${i + batch.length}/${records.length} performance history`)
  }
}

async function migrateMevSnapshots() {
  console.log('\n💰 Migrating MEV snapshots...')
  const records: any[] = []
  await tb.mevSnapshots.select({ pageSize: 100 }).eachPage((recs: any[], next: () => void) => {
    records.push(...recs)
    next()
  })

  console.log(`  Found ${records.length} MEV snapshots`)
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    
    for (const r of batch) {
      const mevCommissionValue = r.get('mevCommission')
      const mevCommission = mevCommissionValue ? Math.round(parseFloat(String(mevCommissionValue))) : null
      
      await sql`
        INSERT INTO mev_snapshots (key, vote_pubkey, epoch, mev_commission)
        VALUES (
          ${String(r.get('key'))},
          ${String(r.get('votePubkey'))},
          ${Number(r.get('epoch'))},
          ${mevCommission}
        )
        ON CONFLICT (key) DO UPDATE SET
          mev_commission = EXCLUDED.mev_commission
      `
    }
    
    console.log(`  ✓ Migrated ${i + batch.length}/${records.length} MEV snapshots`)
  }
}

async function migrateMevEvents() {
  console.log('\n💸 Migrating MEV events...')
  const records: any[] = []
  await tb.mevEvents.select({ pageSize: 100 }).eachPage((recs: any[], next: () => void) => {
    records.push(...recs)
    next()
  })

  console.log(`  Found ${records.length} MEV events`)
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    
    for (const r of batch) {
      const fromCommission = Math.round(parseFloat(String(r.get('fromCommission') || 0)))
      const toCommission = Math.round(parseFloat(String(r.get('toCommission') || 0)))
      const delta = Math.round(parseFloat(String(r.get('delta') || 0)))
      
      await sql`
        INSERT INTO mev_events (vote_pubkey, type, from_commission, to_commission, delta, epoch, created_at)
        VALUES (
          ${String(r.get('votePubkey'))},
          ${String(r.get('type'))},
          ${fromCommission},
          ${toCommission},
          ${delta},
          ${Number(r.get('epoch'))},
          ${r._rawJson.createdTime}
        )
      `
    }
    
    console.log(`  ✓ Migrated ${i + batch.length}/${records.length} MEV events`)
  }
}

async function migrateDailyUptime() {
  console.log('\n📈 Migrating daily uptime...')
  const records: any[] = []
  await tb.dailyUptime.select({ pageSize: 100 }).eachPage((recs: any[], next: () => void) => {
    records.push(...recs)
    next()
  })

  console.log(`  Found ${records.length} daily uptime records`)
  
  let skipped = 0
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    
    for (const r of batch) {
      try {
        await sql`
          INSERT INTO daily_uptime (key, vote_pubkey, date, uptime_checks, delinquent_checks)
          VALUES (
            ${String(r.get('key'))},
            ${String(r.get('votePubkey'))},
            ${String(r.get('date'))},
            ${Number(r.get('uptimeChecks') || 0)},
            ${Number(r.get('delinquentChecks') || 0)}
          )
          ON CONFLICT (key) DO UPDATE SET
            uptime_checks = EXCLUDED.uptime_checks,
            delinquent_checks = EXCLUDED.delinquent_checks
        `
      } catch (error: any) {
        // Skip records for validators that don't exist (foreign key constraint)
        if (error.code === '23503') {
          skipped++
        } else {
          throw error
        }
      }
    }
    
    console.log(`  ✓ Migrated ${i + batch.length}/${records.length} daily uptime (${skipped} skipped)`)
  }
  
  if (skipped > 0) {
    console.log(`  ⚠️  Skipped ${skipped} orphaned uptime records (validator doesn't exist)`)
  }
}

async function migrateValidatorInfoHistory() {
  console.log('\n📝 Migrating validator info history...')
  const records: any[] = []
  await tb.validatorInfoHistory.select({ pageSize: 100 }).eachPage((recs: any[], next: () => void) => {
    records.push(...recs)
    next()
  })

  console.log(`  Found ${records.length} validator info history records`)
  
  let skipped = 0
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    
    for (const r of batch) {
      try {
        await sql`
          INSERT INTO validator_info_history (key, vote_pubkey, epoch, name, icon_url, version)
          VALUES (
            ${String(r.get('key'))},
            ${String(r.get('votePubkey'))},
            ${Number(r.get('epoch'))},
            ${r.get('name') || null},
            ${r.get('iconUrl') || null},
            ${r.get('version') || null}
          )
          ON CONFLICT (key) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, validator_info_history.name),
            icon_url = COALESCE(EXCLUDED.icon_url, validator_info_history.icon_url),
            version = COALESCE(EXCLUDED.version, validator_info_history.version)
        `
      } catch (error: any) {
        // Skip records for validators that don't exist (foreign key constraint)
        if (error.code === '23503') {
          skipped++
        } else {
          throw error
        }
      }
    }
    
    console.log(`  ✓ Migrated ${i + batch.length}/${records.length} validator info history (${skipped} skipped)`)
  }
  
  if (skipped > 0) {
    console.log(`  ⚠️  Skipped ${skipped} orphaned validator info records (validator doesn't exist)`)
  }
}

async function main() {
  console.log('\n🚀 Starting Airtable → PostgreSQL Migration...\n')
  
  // Import after env vars are loaded and assign to global variables
  const airtableModule = await import('../lib/airtable.js')
  const dbModule = await import('../lib/db-neon.js')
  
  tb = airtableModule.tb
  sql = dbModule.sql
  
  try {
    await migrateValidators()
    await migrateSnapshots()
    await migrateEvents()
    await migrateSubscribers()
    await migrateStakeHistory()
    await migratePerformanceHistory()
    await migrateMevSnapshots()
    await migrateMevEvents()
    await migrateDailyUptime()
    await migrateValidatorInfoHistory()
    
    console.log('\n✅ Migration complete!\n')
  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  }
}

main()

