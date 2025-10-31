import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

config({ path: resolve(__dirname, '../.env.local') })

async function fix() {
  const { sql } = await import('../lib/db-neon.js')

  await sql`
    ALTER TABLE subscribers DROP CONSTRAINT IF EXISTS subscribers_preferences_check
  `

  console.log('✅ Fixed subscribers constraint')
}

fix()

