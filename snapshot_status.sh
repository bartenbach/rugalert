#!/bin/bash
psql "$DATABASE_URL" -c "SELECT id, status, started_at, completed_at, error_message FROM job_runs ORDER BY id DESC LIMIT 3;"
