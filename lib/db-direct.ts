// lib/db-direct.ts - Direct (non-pooled) Neon connection for real-time data
// Use this for endpoints that need the absolute latest data without pooler caching
import { neon, NeonQueryFunction } from '@neondatabase/serverless'

// Use DATABASE_URL_UNPOOLED to bypass the Neon pooler and avoid stale cached queries
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!

if (!connectionString) {
  throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL must be set')
}

// Create a function that returns a FRESH SQL client on each call
// This prevents caching issues where the same client instance reuses stale results
export function getFreshSql(): NeonQueryFunction<false, false> {
  return neon(connectionString, {
    fetchConnectionCache: false, // Don't cache the connection
  })
}

// Export a default client for backwards compatibility, but prefer getFreshSql()
export const sql = neon(connectionString)

