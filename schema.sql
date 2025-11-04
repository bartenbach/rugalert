-- RugAlert PostgreSQL Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Validators table
CREATE TABLE validators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vote_pubkey TEXT UNIQUE NOT NULL,
  identity_pubkey TEXT,
  name TEXT,
  icon_url TEXT,
  website TEXT,
  description TEXT,
  version TEXT,
  commission INTEGER DEFAULT 0,
  active_stake BIGINT DEFAULT 0,
  activating_stake BIGINT DEFAULT 0,
  deactivating_stake BIGINT DEFAULT 0,
  stake_account_count INTEGER DEFAULT 0,
  delinquent BOOLEAN DEFAULT FALSE,
  jito_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Snapshots table (commission history)
CREATE TABLE snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL, -- format: "{vote_pubkey}-{epoch}"
  vote_pubkey TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  slot BIGINT,
  commission INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (vote_pubkey) REFERENCES validators(vote_pubkey) ON DELETE CASCADE
);

-- 3. Events table (RUG/CAUTION/INFO alerts)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vote_pubkey TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('RUG', 'CAUTION', 'INFO')),
  from_commission INTEGER NOT NULL,
  to_commission INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  epoch INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (vote_pubkey) REFERENCES validators(vote_pubkey) ON DELETE CASCADE,
  CONSTRAINT events_unique_change UNIQUE (vote_pubkey, epoch, from_commission, to_commission)
);

-- 4. Subscribers table
CREATE TABLE subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  preferences TEXT DEFAULT 'rugs_only' CHECK (preferences IN ('rugs_only', 'all_alerts', 'all_events')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Stake history table
CREATE TABLE stake_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL, -- format: "{vote_pubkey}-{epoch}"
  vote_pubkey TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  slot BIGINT,
  active_stake BIGINT DEFAULT 0,
  activating_stake BIGINT DEFAULT 0,
  deactivating_stake BIGINT DEFAULT 0,
  credits_observed BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (vote_pubkey) REFERENCES validators(vote_pubkey) ON DELETE CASCADE
);

-- 6. Performance history table
CREATE TABLE performance_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL, -- format: "{vote_pubkey}-{epoch}"
  vote_pubkey TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  slot BIGINT,
  credits_earned BIGINT,
  credits_observed BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (vote_pubkey) REFERENCES validators(vote_pubkey) ON DELETE CASCADE
);

-- 7. MEV snapshots table
CREATE TABLE mev_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL, -- format: "{vote_pubkey}-{epoch}"
  vote_pubkey TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  mev_commission INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (vote_pubkey) REFERENCES validators(vote_pubkey) ON DELETE CASCADE
);

-- 8. MEV events table
-- Note: from_mev_commission and to_mev_commission can be NULL (when MEV is disabled)
CREATE TABLE mev_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vote_pubkey TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('RUG', 'CAUTION', 'INFO')),
  from_mev_commission INTEGER, -- NULL when MEV was disabled
  to_mev_commission INTEGER,   -- NULL when MEV is now disabled
  delta INTEGER NOT NULL,
  epoch INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (vote_pubkey) REFERENCES validators(vote_pubkey) ON DELETE CASCADE
);

-- Unique constraints for MEV events (handles NULL properly with partial indexes)
CREATE UNIQUE INDEX IF NOT EXISTS mev_events_unique_change
ON mev_events (vote_pubkey, epoch, from_mev_commission, to_mev_commission)
WHERE from_mev_commission IS NOT NULL AND to_mev_commission IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mev_events_unique_disable
ON mev_events (vote_pubkey, epoch, from_mev_commission)
WHERE to_mev_commission IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mev_events_unique_enable
ON mev_events (vote_pubkey, epoch, to_mev_commission)
WHERE from_mev_commission IS NULL;

-- 9. Daily uptime table
CREATE TABLE daily_uptime (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL, -- format: "{vote_pubkey}-{date}"
  vote_pubkey TEXT NOT NULL,
  date DATE NOT NULL,
  uptime_checks INTEGER DEFAULT 0,
  delinquent_checks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (vote_pubkey) REFERENCES validators(vote_pubkey) ON DELETE CASCADE
);

-- 10. Validator info history table
CREATE TABLE validator_info_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL, -- format: "{vote_pubkey}-{epoch}"
  vote_pubkey TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  identity_pubkey TEXT,
  name TEXT,
  icon_url TEXT,
  website TEXT,
  description TEXT,
  changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (vote_pubkey) REFERENCES validators(vote_pubkey) ON DELETE CASCADE
);

-- ============================================
-- INDEXES for Performance
-- ============================================

-- Validators indexes
CREATE INDEX idx_validators_vote_pubkey ON validators(vote_pubkey);
CREATE INDEX idx_validators_jito_enabled ON validators(jito_enabled) WHERE jito_enabled = TRUE;

-- Snapshots indexes
CREATE INDEX idx_snapshots_vote_pubkey ON snapshots(vote_pubkey);
CREATE INDEX idx_snapshots_epoch ON snapshots(epoch DESC);
CREATE INDEX idx_snapshots_vote_epoch ON snapshots(vote_pubkey, epoch DESC);

-- Events indexes
CREATE INDEX idx_events_vote_pubkey ON events(vote_pubkey);
CREATE INDEX idx_events_epoch ON events(epoch DESC);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_created_at ON events(created_at DESC);

-- Stake history indexes
CREATE INDEX idx_stake_history_vote_pubkey ON stake_history(vote_pubkey);
CREATE INDEX idx_stake_history_epoch ON stake_history(epoch DESC);

-- Performance history indexes
CREATE INDEX idx_performance_history_vote_pubkey ON performance_history(vote_pubkey);
CREATE INDEX idx_performance_history_epoch ON performance_history(epoch DESC);

-- MEV snapshots indexes
CREATE INDEX idx_mev_snapshots_vote_pubkey ON mev_snapshots(vote_pubkey);
CREATE INDEX idx_mev_snapshots_epoch ON mev_snapshots(epoch DESC);

-- MEV events indexes
CREATE INDEX idx_mev_events_vote_pubkey ON mev_events(vote_pubkey);
CREATE INDEX idx_mev_events_epoch ON mev_events(epoch DESC);

-- Daily uptime indexes
CREATE INDEX idx_daily_uptime_vote_pubkey ON daily_uptime(vote_pubkey);
CREATE INDEX idx_daily_uptime_date ON daily_uptime(date DESC);

-- Validator info history indexes
CREATE INDEX idx_validator_info_history_vote_pubkey ON validator_info_history(vote_pubkey);
CREATE INDEX idx_validator_info_history_epoch ON validator_info_history(epoch DESC);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_validators_updated_at
  BEFORE UPDATE ON validators
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscribers_updated_at
  BEFORE UPDATE ON subscribers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (Optional - for safety)
-- ============================================

-- Enable RLS
ALTER TABLE validators ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stake_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE mev_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE mev_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_uptime ENABLE ROW LEVEL SECURITY;
ALTER TABLE validator_info_history ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for API)
CREATE POLICY "Service role has full access" ON validators FOR ALL USING (true);
CREATE POLICY "Service role has full access" ON snapshots FOR ALL USING (true);
CREATE POLICY "Service role has full access" ON events FOR ALL USING (true);
CREATE POLICY "Service role has full access" ON subscribers FOR ALL USING (true);
CREATE POLICY "Service role has full access" ON stake_history FOR ALL USING (true);
CREATE POLICY "Service role has full access" ON performance_history FOR ALL USING (true);
CREATE POLICY "Service role has full access" ON mev_snapshots FOR ALL USING (true);
CREATE POLICY "Service role has full access" ON mev_events FOR ALL USING (true);
CREATE POLICY "Service role has full access" ON daily_uptime FOR ALL USING (true);
CREATE POLICY "Service role has full access" ON validator_info_history FOR ALL USING (true);

-- Allow anon read access to public data
CREATE POLICY "Public read access" ON validators FOR SELECT USING (true);
CREATE POLICY "Public read access" ON snapshots FOR SELECT USING (true);
CREATE POLICY "Public read access" ON events FOR SELECT USING (true);
CREATE POLICY "Public read access" ON stake_history FOR SELECT USING (true);
CREATE POLICY "Public read access" ON performance_history FOR SELECT USING (true);
CREATE POLICY "Public read access" ON mev_snapshots FOR SELECT USING (true);
CREATE POLICY "Public read access" ON mev_events FOR SELECT USING (true);
CREATE POLICY "Public read access" ON daily_uptime FOR SELECT USING (true);
CREATE POLICY "Public read access" ON validator_info_history FOR SELECT USING (true);

