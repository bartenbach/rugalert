import { NextRequest, NextResponse } from 'next/server';
import { checkJitoValidator, fetchAllJitoValidators } from '../../../../lib/jito';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint to test Jito validator detection
 * 
 * Usage: 
 * - /api/debug/jito-check?vote=<VOTE_PUBKEY>  - Check specific validator
 * - /api/debug/jito-check?all=true            - List all Jito validators
 */
export async function GET(req: NextRequest) {
  try {
    const votePubkey = req.nextUrl.searchParams.get('vote');
    const all = req.nextUrl.searchParams.get('all');
    
    // List all Jito validators
    if (all) {
      const jitoValidators = await fetchAllJitoValidators();
      const validators = Array.from(jitoValidators.entries()).map(([vote, info]) => ({
        vote_account: vote,
        ...info,
      }));
      
      return NextResponse.json({
        total: validators.length,
        validators: validators.slice(0, 50), // Limit to first 50 for readability
        note: validators.length > 50 ? `Showing first 50 of ${validators.length} validators` : undefined,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Check specific validator
    if (!votePubkey) {
      return NextResponse.json({
        error: 'Missing vote parameter',
        usage: {
          checkValidator: '/api/debug/jito-check?vote=<VOTE_PUBKEY>',
          listAll: '/api/debug/jito-check?all=true'
        },
        examples: {
          pumpkin: '/api/debug/jito-check?vote=2ZiMfQvMJvM1b8TujANk6BaZ8Qpmjbn1DF9Z9SQcxZJY',
          stakewiz: '/api/debug/jito-check?vote=5ZwjhGRacdLWS3L5DJNwqVpMN2LX8q3cVQMpETdvfmAH',
        }
      }, { status: 400 });
    }
    
    console.log(`🔍 Checking Jito status for: ${votePubkey}`);
    
    const result = await checkJitoValidator(votePubkey);
    
    return NextResponse.json({
      vote_account: votePubkey,
      ...result,
      note: result.isJitoEnabled 
        ? `✅ Validator runs Jito with ${result.mevCommission}% MEV commission`
        : '❌ Validator does not run Jito',
      api: 'https://kobe.mainnet.jito.network/api/v1/validators',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('❌ jito-check error:', error);
    return NextResponse.json(
      { 
        error: String(error?.message || error),
        stack: error?.stack,
      },
      { status: 500 }
    );
  }
}

