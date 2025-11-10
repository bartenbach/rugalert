import { sql } from '@/lib/db-neon'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { email, votePubkey } = await req.json()
    
    // Validate inputs
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }
    
    if (!votePubkey || typeof votePubkey !== 'string') {
      return NextResponse.json({ error: 'Invalid validator pubkey' }, { status: 400 })
    }
    
    // Delete the subscription
    const result = await sql`
      DELETE FROM validator_subscriptions 
      WHERE email = ${email} AND vote_pubkey = ${votePubkey}
      RETURNING id
    `
    
    if (result.length === 0) {
      return NextResponse.json({ 
        error: 'Subscription not found' 
      }, { status: 404 })
    }
    
    console.log(`✅ Validator unsubscribed: ${email} from ${votePubkey}`)
    
    return NextResponse.json({ 
      success: true, 
      message: 'Successfully unsubscribed from validator alerts' 
    })
    
  } catch (error: any) {
    console.error('❌ Validator unsubscribe error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to unsubscribe' 
    }, { status: 500 })
  }
}

