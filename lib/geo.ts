// lib/geo.ts - Validator Geolocation Resolution
//
// Uses ip-api.com batch endpoint to resolve validator IPs to geographic locations.
// The batch endpoint accepts up to 100 IPs per request and includes ASN data.
// Rate limit: 45 requests/minute (plenty for ~1900 validators in 19 batches).

export type GeoResult = {
  ip: string
  success: boolean
  country?: string
  countryCode?: string
  region?: string      // State/Province code
  regionName?: string  // State/Province full name
  city?: string
  lat?: number
  lon?: number
  timezone?: string
  isp?: string
  org?: string
  as?: string          // e.g., "AS24940 Hetzner Online GmbH"
  asNumber?: number
  asName?: string
  dataCenter?: string  // Normalized data center provider name
}

// Known data center providers mapped by ASN or org name keywords
const DATA_CENTER_MAP: Record<number, string> = {
  24940: 'Hetzner',
  213230: 'Hetzner',
  16276: 'OVH',
  16509: 'AWS',
  14618: 'AWS',
  8075: 'Microsoft Azure',
  15169: 'Google Cloud',
  396982: 'Google Cloud',
  14061: 'DigitalOcean',
  20473: 'Vultr',
  63949: 'Akamai (Linode)',
  46844: 'Latitude.sh',
  395201: 'Latitude.sh',
  398493: 'Latitude.sh',
  174: 'Cogent',
  6939: 'Hurricane Electric',
  3223: 'Voxility',
  51167: 'Contabo',
  44592: 'SkyLink',
  61317: 'Digital Realty',
  13335: 'Cloudflare',
  40676: 'Psychz Networks',
  30083: 'HE GigaPOP',
  55286: 'Server Central',
  29802: 'HVC-AS',
  57858: 'Cherry Servers',
  44477: 'Cherry Servers',
  209: 'CenturyLink / Lumen',
  3356: 'CenturyLink / Lumen',
  59253: 'Solana Foundation',
  36114: 'Teraswitch',
  199524: 'G-Core Labs',
  132203: 'Tencent Cloud',
  45102: 'Alibaba Cloud',
  398324: 'Zenlayer',
  21859: 'Zenlayer',
}

// Keyword-based fallback for org/ISP names
const DATA_CENTER_KEYWORDS: [string, string][] = [
  ['hetzner', 'Hetzner'],
  ['ovh', 'OVH'],
  ['amazon', 'AWS'],
  ['aws', 'AWS'],
  ['google', 'Google Cloud'],
  ['microsoft', 'Microsoft Azure'],
  ['azure', 'Microsoft Azure'],
  ['digitalocean', 'DigitalOcean'],
  ['digital ocean', 'DigitalOcean'],
  ['vultr', 'Vultr'],
  ['linode', 'Akamai (Linode)'],
  ['akamai', 'Akamai (Linode)'],
  ['latitude', 'Latitude.sh'],
  ['maxihost', 'Latitude.sh'],
  ['contabo', 'Contabo'],
  ['cherry', 'Cherry Servers'],
  ['equinix', 'Equinix'],
  ['teraswitch', 'Teraswitch'],
  ['cogent', 'Cogent'],
  ['hurricane', 'Hurricane Electric'],
  ['psychz', 'Psychz Networks'],
  ['leaseweb', 'LeaseWeb'],
  ['zenlayer', 'Zenlayer'],
  ['tencent', 'Tencent Cloud'],
  ['alibaba', 'Alibaba Cloud'],
  ['g-core', 'G-Core Labs'],
  ['gcore', 'G-Core Labs'],
  ['edgevana', 'Edgevana'],
  ['solana foundation', 'Solana Foundation'],
]

/**
 * Resolve the data center provider from ASN or org/ISP strings.
 */
export function resolveDataCenter(asNumber?: number, org?: string, isp?: string): string {
  // First try ASN lookup (most reliable)
  if (asNumber && DATA_CENTER_MAP[asNumber]) {
    return DATA_CENTER_MAP[asNumber]
  }

  // Then try keyword matching on org and ISP
  const searchStr = `${org || ''} ${isp || ''}`.toLowerCase()
  for (const [keyword, dcName] of DATA_CENTER_KEYWORDS) {
    if (searchStr.includes(keyword)) {
      return dcName
    }
  }

  return 'Other'
}

/**
 * Parse the AS string from ip-api.com into number and name.
 * Example: "AS24940 Hetzner Online GmbH" -> { number: 24940, name: "Hetzner Online GmbH" }
 */
function parseAS(asStr?: string): { number?: number; name?: string } {
  if (!asStr) return {}
  const match = asStr.match(/^AS(\d+)\s+(.+)$/)
  if (match) {
    return {
      number: parseInt(match[1], 10),
      name: match[2].trim(),
    }
  }
  return {}
}

/**
 * Resolve a batch of IPs using ip-api.com batch endpoint.
 * Accepts up to 100 IPs per call. Returns results in the same order.
 */
export async function resolveIpBatch(ips: string[]): Promise<GeoResult[]> {
  if (ips.length === 0) return []
  if (ips.length > 100) {
    throw new Error(`ip-api.com batch endpoint supports max 100 IPs, got ${ips.length}`)
  }

  const body = ips.map(ip => ({
    query: ip,
    fields: 'status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as',
  }))

  const response = await fetch('http://ip-api.com/batch?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`ip-api.com batch request failed: ${response.status} ${response.statusText}`)
  }

  const results = await response.json() as any[]

  return results.map((r, i) => {
    if (r.status === 'fail') {
      return {
        ip: ips[i],
        success: false,
      }
    }

    const { number: asNumber, name: asName } = parseAS(r.as)
    const dataCenter = resolveDataCenter(asNumber, r.org, r.isp)

    return {
      ip: ips[i],
      success: true,
      country: r.country,
      countryCode: r.countryCode,
      region: r.region,
      regionName: r.regionName,
      city: r.city,
      lat: r.lat,
      lon: r.lon,
      timezone: r.timezone,
      isp: r.isp,
      org: r.org,
      as: r.as,
      asNumber,
      asName,
      dataCenter,
    }
  })
}

/**
 * Resolve all IPs with automatic batching and rate limiting.
 * Splits into chunks of 100 and waits between batches.
 */
export async function resolveAllIps(
  ips: string[],
  onProgress?: (processed: number, total: number) => void
): Promise<Map<string, GeoResult>> {
  const results = new Map<string, GeoResult>()
  const BATCH_SIZE = 100
  const DELAY_MS = 1500 // 1.5s between batches (well within 45 req/min)

  // Deduplicate IPs
  const uniqueIps = [...new Set(ips)]

  for (let i = 0; i < uniqueIps.length; i += BATCH_SIZE) {
    const batch = uniqueIps.slice(i, i + BATCH_SIZE)

    try {
      const batchResults = await resolveIpBatch(batch)
      for (const result of batchResults) {
        results.set(result.ip, result)
      }
    } catch (error) {
      console.error(`Geo batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error)
      // Mark failed IPs
      for (const ip of batch) {
        results.set(ip, { ip, success: false })
      }
    }

    onProgress?.(Math.min(i + BATCH_SIZE, uniqueIps.length), uniqueIps.length)

    // Rate limiting delay between batches (skip after last batch)
    if (i + BATCH_SIZE < uniqueIps.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS))
    }
  }

  return results
}
