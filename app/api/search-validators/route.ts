import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db-neon';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get('q') || '';
    
    if (!query || query.length < 2) {
      return NextResponse.json({
        results: [],
        message: 'Query must be at least 2 characters',
      });
    }

    // Search validators by name or vote pubkey (case insensitive)
    const validators = await sql`
      SELECT vote_pubkey, name, icon_url, identity_pubkey
      FROM validators
      WHERE 
        LOWER(name) LIKE ${`%${query.toLowerCase()}%`}
        OR LOWER(vote_pubkey) LIKE ${`%${query.toLowerCase()}%`}
      LIMIT 20
    `;

    // Format results
    const results = validators.map(v => ({
      votePubkey: v.vote_pubkey,
      name: v.name || 'Unknown Validator',
      iconUrl: v.icon_url,
      identityPubkey: v.identity_pubkey,
    }));

    return NextResponse.json({
      results,
      total: results.length,
    });
  } catch (error: any) {
    console.error('❌ search-validators error:', error);
    return NextResponse.json(
      { error: String(error?.message || error) },
      { status: 500 }
    );
  }
}

