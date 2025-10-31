-- ============================================
-- Database Indexes for Validator Page Performance
-- ============================================
-- Run these in your Neon SQL Editor to speed up validator pages
-- This will make individual validator pages load MUCH faster

-- Stake History Indexes
-- (speeds up stake charts on validator pages)
CREATE INDEX IF NOT EXISTS idx_stake_history_vote_pubkey_epoch 
ON stake_history(vote_pubkey, epoch DESC);

-- Performance History Indexes  
-- (speeds up skip rate and vote credits charts)
CREATE INDEX IF NOT EXISTS idx_performance_history_vote_pubkey_epoch 
ON performance_history(vote_pubkey, epoch DESC);

-- Commission Snapshots Indexes
-- (speeds up commission history chart)
CREATE INDEX IF NOT EXISTS idx_snapshots_vote_pubkey_slot 
ON snapshots(vote_pubkey, slot DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_vote_pubkey_epoch 
ON snapshots(vote_pubkey, epoch DESC);

-- Events Indexes
-- (speeds up event timeline on validator pages)
CREATE INDEX IF NOT EXISTS idx_events_vote_pubkey_created 
ON events(vote_pubkey, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_vote_pubkey_epoch 
ON events(vote_pubkey, epoch DESC);

-- MEV Snapshots Indexes
-- (speeds up MEV commission display)
CREATE INDEX IF NOT EXISTS idx_mev_snapshots_vote_pubkey_epoch 
ON mev_snapshots(vote_pubkey, epoch DESC);

-- Daily Uptime Indexes
-- (speeds up uptime percentage calculation)
CREATE INDEX IF NOT EXISTS idx_daily_uptime_vote_pubkey_date 
ON daily_uptime(vote_pubkey, date DESC);

-- Validator Info History Indexes
-- (speeds up info change timeline)
CREATE INDEX IF NOT EXISTS idx_validator_info_history_vote_pubkey 
ON validator_info_history(vote_pubkey, changed_at DESC);

-- ============================================
-- Verify Indexes Were Created
-- ============================================
-- Run this after to confirm all indexes exist:
-- 
-- SELECT 
--   schemaname, 
--   tablename, 
--   indexname 
-- FROM pg_indexes 
-- WHERE schemaname = 'public'
-- ORDER BY tablename, indexname;

