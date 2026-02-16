// GET /api/stake-concentration - Aggregate stake concentration metrics
//
// Returns stake distribution by country, city, data center provider, and ASN.
// Also calculates the geographic Nakamoto coefficient (how many locations
// needed to reach 33.3% of total stake - the superminority threshold).

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db-neon'

export const dynamic = 'force-dynamic'
export const revalidate = 300 // Cache for 5 minutes

type ConcentrationEntry = {
  name: string
  code?: string
  validatorCount: number
  totalStake: number
  stakePercent: number
}

type DataCenterEntry = ConcentrationEntry & {
  asNumber?: number
  asName?: string
  topCities?: Array<{ city: string; country: string; stake: number; validators: number }>
}

export async function GET(req: NextRequest) {
  try {
    // Join validator_locations with validators to get stake data
    // Use active_stake from the validators table (already in lamports)
    const LAMPORTS_PER_SOL = 1_000_000_000

    const geoData = await sql`
      SELECT 
        vl.vote_pubkey,
        vl.country,
        vl.country_code,
        vl.region,
        vl.city,
        vl.data_center,
        vl.as_number,
        vl.as_name,
        vl.latitude,
        vl.longitude,
        v.active_stake,
        v.name as validator_name
      FROM validator_locations vl
      JOIN validators v ON v.vote_pubkey = vl.vote_pubkey
      WHERE vl.lookup_success = true
        AND v.active_stake > 0
    `

    if (geoData.length === 0) {
      return NextResponse.json({
        error: 'No geolocation data available. Run the geo-snapshot job first.',
        hint: 'POST to /api/geo-snapshot with the cron secret to populate geo data.',
      }, { status: 404 })
    }

    // Calculate total stake across all geo-located validators
    let totalStake = 0
    for (const row of geoData) {
      totalStake += Number(row.active_stake || 0)
    }
    const totalStakeSOL = totalStake / LAMPORTS_PER_SOL

    // Get total network stake for the percentage calculation (includes validators without geo)
    const totalNetworkResult = await sql`
      SELECT SUM(active_stake) as total FROM validators WHERE active_stake > 0
    `
    const totalNetworkStake = Number(totalNetworkResult[0]?.total || 0)
    const totalNetworkStakeSOL = totalNetworkStake / LAMPORTS_PER_SOL
    const geoCoverage = totalNetworkStake > 0
      ? (totalStake / totalNetworkStake) * 100
      : 0

    // ---- Aggregate by Country ----
    const countryMap = new Map<string, { name: string; code: string; stake: number; count: number }>()
    for (const row of geoData) {
      const key = row.country_code || 'XX'
      const entry = countryMap.get(key) || {
        name: row.country || 'Unknown',
        code: key,
        stake: 0,
        count: 0,
      }
      entry.stake += Number(row.active_stake || 0)
      entry.count++
      countryMap.set(key, entry)
    }

    const byCountry: ConcentrationEntry[] = Array.from(countryMap.values())
      .map(e => ({
        name: e.name,
        code: e.code,
        validatorCount: e.count,
        totalStake: e.stake / LAMPORTS_PER_SOL,
        stakePercent: totalNetworkStake > 0 ? (e.stake / totalNetworkStake) * 100 : 0,
      }))
      .sort((a, b) => b.totalStake - a.totalStake)

    // ---- Aggregate by Data Center Provider ----
    const dcMap = new Map<string, {
      name: string
      stake: number
      count: number
      cities: Map<string, { city: string; country: string; stake: number; validators: number }>
    }>()

    for (const row of geoData) {
      const dc = row.data_center || 'Other'
      const entry = dcMap.get(dc) || {
        name: dc,
        stake: 0,
        count: 0,
        cities: new Map(),
      }
      entry.stake += Number(row.active_stake || 0)
      entry.count++

      // Track cities within this DC
      const cityKey = `${row.city || 'Unknown'}-${row.country_code || 'XX'}`
      const cityEntry = entry.cities.get(cityKey) || {
        city: row.city || 'Unknown',
        country: row.country || 'Unknown',
        stake: 0,
        validators: 0,
      }
      cityEntry.stake += Number(row.active_stake || 0)
      cityEntry.validators++
      entry.cities.set(cityKey, cityEntry)

      dcMap.set(dc, entry)
    }

    const byDataCenter: DataCenterEntry[] = Array.from(dcMap.values())
      .map(e => ({
        name: e.name,
        validatorCount: e.count,
        totalStake: e.stake / LAMPORTS_PER_SOL,
        stakePercent: totalNetworkStake > 0 ? (e.stake / totalNetworkStake) * 100 : 0,
        topCities: Array.from(e.cities.values())
          .sort((a, b) => b.stake - a.stake)
          .slice(0, 5)
          .map(c => ({
            city: c.city,
            country: c.country,
            stake: c.stake / LAMPORTS_PER_SOL,
            validators: c.validators,
          })),
      }))
      .sort((a, b) => b.totalStake - a.totalStake)

    // ---- Aggregate by City ----
    const cityMap = new Map<string, {
      city: string
      country: string
      countryCode: string
      stake: number
      count: number
      dataCenters: Set<string>
    }>()

    for (const row of geoData) {
      const key = `${row.city || 'Unknown'}-${row.country_code || 'XX'}`
      const entry = cityMap.get(key) || {
        city: row.city || 'Unknown',
        country: row.country || 'Unknown',
        countryCode: row.country_code || 'XX',
        stake: 0,
        count: 0,
        dataCenters: new Set<string>(),
      }
      entry.stake += Number(row.active_stake || 0)
      entry.count++
      if (row.data_center) entry.dataCenters.add(row.data_center)
      cityMap.set(key, entry)
    }

    const byCity = Array.from(cityMap.values())
      .map(e => ({
        name: `${e.city}, ${e.country}`,
        city: e.city,
        country: e.country,
        countryCode: e.countryCode,
        validatorCount: e.count,
        totalStake: e.stake / LAMPORTS_PER_SOL,
        stakePercent: totalNetworkStake > 0 ? (e.stake / totalNetworkStake) * 100 : 0,
        dataCenters: Array.from(e.dataCenters),
      }))
      .sort((a, b) => b.totalStake - a.totalStake)

    // ---- Aggregate by ASN (most granular data center identification) ----
    const asnMap = new Map<number, {
      asNumber: number
      asName: string
      dataCenter: string
      stake: number
      count: number
    }>()

    for (const row of geoData) {
      if (!row.as_number) continue
      const asn = Number(row.as_number)
      const entry = asnMap.get(asn) || {
        asNumber: asn,
        asName: row.as_name || 'Unknown',
        dataCenter: row.data_center || 'Other',
        stake: 0,
        count: 0,
      }
      entry.stake += Number(row.active_stake || 0)
      entry.count++
      asnMap.set(asn, entry)
    }

    const byASN = Array.from(asnMap.values())
      .map(e => ({
        asNumber: e.asNumber,
        asName: e.asName,
        dataCenter: e.dataCenter,
        validatorCount: e.count,
        totalStake: e.stake / LAMPORTS_PER_SOL,
        stakePercent: totalNetworkStake > 0 ? (e.stake / totalNetworkStake) * 100 : 0,
      }))
      .sort((a, b) => b.totalStake - a.totalStake)

    // ---- Calculate Nakamoto Coefficients ----
    // The superminority threshold: how many entities needed to control 33.3% of stake
    const SUPERMINORITY_THRESHOLD = 33.33

    function calcNakamoto(entries: { totalStake: number }[]): number {
      const sorted = [...entries].sort((a, b) => b.totalStake - a.totalStake)
      let cumulative = 0
      for (let i = 0; i < sorted.length; i++) {
        cumulative += sorted[i].totalStake
        if ((cumulative / totalStakeSOL) * 100 >= SUPERMINORITY_THRESHOLD) {
          return i + 1
        }
      }
      return sorted.length
    }

    const nakamotoByCountry = calcNakamoto(byCountry)
    const nakamotoByDataCenter = calcNakamoto(byDataCenter)
    const nakamotoByCity = calcNakamoto(byCity)
    const nakamotoByASN = calcNakamoto(byASN)

    // ---- Superminority analysis (entities holding >33.3% cumulatively) ----
    function getSuperminority(entries: ConcentrationEntry[]) {
      const sorted = [...entries].sort((a, b) => b.totalStake - a.totalStake)
      let cumulative = 0
      const result: (ConcentrationEntry & { cumulativePercent: number })[] = []
      for (const entry of sorted) {
        cumulative += entry.totalStake
        const cumulativePercent = (cumulative / totalStakeSOL) * 100
        result.push({ ...entry, cumulativePercent })
        if (cumulativePercent >= SUPERMINORITY_THRESHOLD) break
      }
      return result
    }

    return NextResponse.json({
      summary: {
        totalGeoLocatedValidators: geoData.length,
        totalNetworkStakeSOL: totalNetworkStakeSOL,
        geoLocatedStakeSOL: totalStakeSOL,
        geoCoveragePercent: Math.round(geoCoverage * 100) / 100,
        uniqueCountries: countryMap.size,
        uniqueCities: cityMap.size,
        uniqueDataCenters: dcMap.size,
        uniqueASNs: asnMap.size,
      },
      nakamotoCoefficients: {
        byCountry: nakamotoByCountry,
        byDataCenter: nakamotoByDataCenter,
        byCity: nakamotoByCity,
        byASN: nakamotoByASN,
        threshold: SUPERMINORITY_THRESHOLD,
      },
      superminority: {
        byCountry: getSuperminority(byCountry),
        byDataCenter: getSuperminority(byDataCenter),
      },
      byCountry: byCountry.slice(0, 50),
      byDataCenter: byDataCenter.slice(0, 30),
      byCity: byCity.slice(0, 50),
      byASN: byASN.slice(0, 50),
    })
  } catch (error: any) {
    console.error('Stake concentration error:', error)
    return NextResponse.json(
      { error: String(error?.message || error) },
      { status: 500 }
    )
  }
}
