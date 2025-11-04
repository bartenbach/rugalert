-- Simple table to track snapshot job executions
CREATE TABLE IF NOT EXISTS job_runs (
  id SERIAL PRIMARY KEY,
  job_name VARCHAR(50) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL, -- 'running', 'success', 'failed'
  epoch INTEGER,
  duration_seconds INTEGER,
  metrics JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job_name_completed ON job_runs(job_name, completed_at DESC);

-- For quick "last run" queries
CREATE INDEX IF NOT EXISTS idx_job_runs_latest ON job_runs(job_name, created_at DESC);
