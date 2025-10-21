import { NextRequest, NextResponse } from 'next/server';
import { tb } from '../../../lib/airtable';

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

    // Search validators by name or vote pubkey
    const validators: any[] = [];
    
    await tb.validators.select({
      pageSize: 100,
      // Search by name (case insensitive) or vote pubkey
      filterByFormula: `OR(
        SEARCH(LOWER("${query.toLowerCase()}"), LOWER({name})),
        SEARCH(LOWER("${query.toLowerCase()}"), LOWER({votePubkey}))
      )`,
    }).eachPage((records, fetchNextPage) => {
      validators.push(...records);
      fetchNextPage();
    });

    // Format results
    const results = validators.slice(0, 20).map(v => ({
      votePubkey: v.get('votePubkey'),
      name: v.get('name') || 'Unknown Validator',
      iconUrl: v.get('iconUrl'),
      identityPubkey: v.get('identityPubkey'),
    }));

    return NextResponse.json({
      results,
      total: validators.length,
    });
  } catch (error: any) {
    console.error('❌ search-validators error:', error);
    return NextResponse.json(
      { error: String(error?.message || error) },
      { status: 500 }
    );
  }
}

