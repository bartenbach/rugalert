// lib/db-direct.ts - Direct (non-pooled) Neon connection for real-time data
// Use this for endpoints that need the absolute latest data without pooler caching
import { neon } from '@neondatabase/serverless'

// Use DATABASE_URL_UNPOOLED to bypass the Neon pooler and avoid stale cached queries
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!

if (!connectionString) {
  throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL must be set')
}

// Log which connection type we're using (only in development)
if (process.env.NODE_ENV === 'development') {
  const isDirect = connectionString.includes('-pooler.') === false
  console.log(`[db-direct] Using ${isDirect ? 'DIRECT' : 'POOLED'} connection`)
}

export const sql = neon(connectionString)

