// Geolocation Snapshot Cron Job
// Resolves validator IPs to geographic locations and data center info.
// Runs every 6 hours (validators rarely change data centers).
//
// Flow:
// 1. getClusterNodes() → identity_pubkey → IP address
// 2. getVoteAccounts() → vote_pubkey → identity_pubkey mapping
// 3. ip-api.com batch → IP → geo data (country, city, ASN, data center)
// 4. Upsert into validator_locations table

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db-neon'
import { resolveAllIps, type GeoResult } from '@/lib/geo'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // 2 minutes should be plenty

async function rpc(method: string, params: any[] = []) {
  const res = await fetch(process.env.RPC_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(JSON.stringify(json.error || res.status))
  return json.result
}

export async function GET(req: NextRequest) {
  const userAgent = req.headers.get('user-agent')
  if (userAgent?.includes('vercel-cron')) {
    return POST(req)
  }
  return NextResponse.json({
    error: 'Method not allowed. Use POST with x-cron-secret header.',
    hint: 'This endpoint is designed to be called by Vercel Cron',
  }, { status: 405 })
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  const userAgent = req.headers.get('user-agent')

  const isAuthorized =
    cronSecret === process.env.CRON_SECRET ||
    userAgent?.includes('vercel-cron')

  if (!isAuthorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const log = (msg: string) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`⏱️  [${elapsed}s] [geo-snapshot] ${msg}`)
  }

  console.log('\n🌍 ========== GEO SNAPSHOT JOB STARTED ==========')

  try {
    // 1. Fetch cluster nodes (identity_pubkey -> IP) and vote accounts (vote -> identity mapping)
    log('Fetching cluster nodes and vote accounts...')
    const [clusterNodes, votes] = await Promise.all([
      rpc('getClusterNodes', []),
      rpc('getVoteAccounts', []),
    ])

    // Build identity -> IP map from cluster nodes
    // gossip field format is "IP:PORT", we just need the IP
    const identityToIp = new Map<string, string>()
    for (const node of clusterNodes as any[]) {
      if (node.pubkey && node.gossip) {
        const ip = node.gossip.split(':')[0]
        if (ip && ip !== '127.0.0.1' && ip !== '0.0.0.0') {
          identityToIp.set(node.pubkey, ip)
        }
      }
    }
    log(`Found ${identityToIp.size} nodes with gossip IPs`)

    // Build vote_pubkey -> identity_pubkey mapping
    const allVotes = [...votes.current, ...votes.delinquent] as Array<{
      votePubkey: string
      nodePubkey: string
    }>

    // Build the final mapping: vote_pubkey -> { identityPubkey, ip }
    type ValidatorIpEntry = {
      votePubkey: string
      identityPubkey: string
      ip: string
    }
    const validatorIps: ValidatorIpEntry[] = []
    const ipSet = new Set<string>()

    for (const v of allVotes) {
      const ip = identityToIp.get(v.nodePubkey)
      if (ip) {
        validatorIps.push({
          votePubkey: v.votePubkey,
          identityPubkey: v.nodePubkey,
          ip,
        })
        ipSet.add(ip)
      }
    }
    log(`Mapped ${validatorIps.length} validators to IPs (${ipSet.size} unique IPs)`)

    // 2. Check which validators already have up-to-date geo data
    // Skip validators whose IP hasn't changed since last update
    const existingLocations = await sql`
      SELECT vote_pubkey, ip_address, updated_at
      FROM validator_locations
    `
    const existingIpMap = new Map<string, string>()
    for (const loc of existingLocations) {
      existingIpMap.set(loc.vote_pubkey, loc.ip_address)
    }

    // Filter to only validators that need updating (new or IP changed)
    const needsUpdate = validatorIps.filter(v => {
      const existingIp = existingIpMap.get(v.votePubkey)
      return existingIp !== v.ip
    })

    log(`${needsUpdate.length} validators need geo update (${validatorIps.length - needsUpdate.length} already up-to-date)`)

    if (needsUpdate.length === 0) {
      log('No geo updates needed, done!')
      return NextResponse.json({
        ok: true,
        updated: 0,
        skipped: validatorIps.length,
        elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      })
    }

    // 3. Resolve IPs to geo locations
    const ipsToResolve = needsUpdate.map(v => v.ip)
    log(`Resolving ${ipsToResolve.length} IPs via ip-api.com...`)

    const geoResults = await resolveAllIps(ipsToResolve, (processed, total) => {
      log(`Geo resolution: ${processed}/${total} IPs processed`)
    })
    log(`Geo resolution complete: ${geoResults.size} results`)

    // 4. Upsert into validator_locations
    let updated = 0
    let failed = 0

    for (const entry of needsUpdate) {
      const geo = geoResults.get(entry.ip)
      if (!geo) {
        failed++
        continue
      }

      try {
        await sql`
          INSERT INTO validator_locations (
            vote_pubkey, identity_pubkey, ip_address,
            country, country_code, region, city,
            latitude, longitude, timezone,
            isp, org, as_number, as_name, data_center,
            lookup_success
          ) VALUES (
            ${entry.votePubkey},
            ${entry.identityPubkey},
            ${entry.ip},
            ${geo.country || null},
            ${geo.countryCode || null},
            ${geo.regionName || null},
            ${geo.city || null},
            ${geo.lat || null},
            ${geo.lon || null},
            ${geo.timezone || null},
            ${geo.isp || null},
            ${geo.org || null},
            ${geo.asNumber || null},
            ${geo.asName || null},
            ${geo.dataCenter || null},
            ${geo.success}
          )
          ON CONFLICT (vote_pubkey)
          DO UPDATE SET
            identity_pubkey = EXCLUDED.identity_pubkey,
            ip_address = EXCLUDED.ip_address,
            country = EXCLUDED.country,
            country_code = EXCLUDED.country_code,
            region = EXCLUDED.region,
            city = EXCLUDED.city,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            timezone = EXCLUDED.timezone,
            isp = EXCLUDED.isp,
            org = EXCLUDED.org,
            as_number = EXCLUDED.as_number,
            as_name = EXCLUDED.as_name,
            data_center = EXCLUDED.data_center,
            lookup_success = EXCLUDED.lookup_success
        `
        updated++
      } catch (dbErr: any) {
        console.error(`Failed to upsert geo for ${entry.votePubkey}:`, dbErr.message)
        failed++
      }
    }

    log(`Upserted ${updated} validator locations (${failed} failed)`)

    // 5. Log success summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\n🌍 ========== GEO SNAPSHOT COMPLETE ==========`)
    console.log(`✅ Updated: ${updated}`)
    console.log(`❌ Failed: ${failed}`)
    console.log(`⏭️  Skipped (no change): ${validatorIps.length - needsUpdate.length}`)
    console.log(`⏱️  Duration: ${elapsed}s`)

    return NextResponse.json({
      ok: true,
      updated,
      failed,
      skipped: validatorIps.length - needsUpdate.length,
      totalValidators: validatorIps.length,
      uniqueIps: ipSet.size,
      elapsed: `${elapsed}s`,
    })
  } catch (err: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.error(`❌ [${elapsed}s] Geo snapshot error:`, err.message || err)
    return NextResponse.json(
      { error: String(err?.message || err), elapsed: `${elapsed}s` },
      { status: 500 }
    )
  }
}
