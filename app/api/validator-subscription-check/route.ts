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
    
    // Check if subscription exists
    const result = await sql`
      SELECT 
        email,
        vote_pubkey,
        commission_alerts,
        delinquency_alerts,
        created_at
      FROM validator_subscriptions 
      WHERE email = ${email} AND vote_pubkey = ${votePubkey}
    `
    
    if (result.length === 0) {
      return NextResponse.json({ 
        subscribed: false 
      })
    }
    
    return NextResponse.json({ 
      subscribed: true,
      subscription: {
        email: result[0].email,
        votePubkey: result[0].vote_pubkey,
        commissionAlerts: result[0].commission_alerts,
        delinquencyAlerts: result[0].delinquency_alerts,
        createdAt: result[0].created_at
      }
    })
    
  } catch (error: any) {
    console.error('❌ Subscription check error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to check subscription' 
    }, { status: 500 })
  }
}

