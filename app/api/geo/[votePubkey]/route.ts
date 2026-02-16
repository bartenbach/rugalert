// GET /api/geo/[votePubkey] - Get geolocation data for a single validator
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db-neon'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { votePubkey: string } }
) {
  try {
    const { votePubkey } = params

    const records = await sql`
      SELECT 
        vote_pubkey, identity_pubkey, ip_address,
        country, country_code, region, city,
        latitude, longitude, timezone,
        isp, org, as_number, as_name, data_center,
        lookup_success, updated_at
      FROM validator_locations
      WHERE vote_pubkey = ${votePubkey}
      LIMIT 1
    `

    if (!records[0]) {
      return NextResponse.json(
        { error: 'No geolocation data for this validator' },
        { status: 404 }
      )
    }

    const loc = records[0]
    return NextResponse.json({
      votePubkey: loc.vote_pubkey,
      identityPubkey: loc.identity_pubkey,
      ipAddress: loc.ip_address,
      country: loc.country,
      countryCode: loc.country_code,
      region: loc.region,
      city: loc.city,
      latitude: loc.latitude,
      longitude: loc.longitude,
      timezone: loc.timezone,
      isp: loc.isp,
      org: loc.org,
      asNumber: loc.as_number,
      asName: loc.as_name,
      dataCenter: loc.data_center,
      lookupSuccess: loc.lookup_success,
      updatedAt: loc.updated_at,
    })
  } catch (error: any) {
    console.error('Geo lookup error:', error)
    return NextResponse.json(
      { error: String(error?.message || error) },
      { status: 500 }
    )
  }
}
