import { NextRequest, NextResponse } from 'next/server';
import { checkJitoValidator } from '../../../../lib/jito';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint to test Jito validator detection
 * 
 * Usage: /api/debug/jito-check?identity=<VALIDATOR_IDENTITY_PUBKEY>
 */
export async function GET(req: NextRequest) {
  try {
    const identity = req.nextUrl.searchParams.get('identity');
    
    if (!identity) {
      return NextResponse.json({
        error: 'Missing identity parameter',
        usage: '/api/debug/jito-check?identity=<VALIDATOR_IDENTITY_PUBKEY>',
        examples: {
          stakewiz: '/api/debug/jito-check?identity=7emL18Bnve7wbYE9Az7vYJjNP2vtqFTwgDoBKqXhTujZ',
          triton: '/api/debug/jito-check?identity=8szGkuLTAux9XMgZ2vtY39jVSowEcpBfFfD8hXSEqdGC',
        }
      }, { status: 400 });
    }
    
    const rpcUrl = process.env.RPC_URL!;
    
    console.log(`🔍 Checking Jito status for: ${identity}`);
    
    const result = await checkJitoValidator(identity, rpcUrl);
    
    return NextResponse.json({
      identity,
      ...result,
      note: result.isJitoEnabled 
        ? 'Validator runs Jito! MEV commission detection needs implementation.'
        : 'Validator does not appear to run Jito (based on version check)',
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

