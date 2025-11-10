import { sql } from '@/lib/db-neon'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { email, votePubkey, commissionAlerts, delinquencyAlerts } = await req.json()
    
    // Validate inputs
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    
    if (!votePubkey || typeof votePubkey !== 'string') {
      return NextResponse.json({ error: 'Invalid validator pubkey' }, { status: 400 })
    }
    
    // At least one alert type must be enabled
    const hasCommission = commissionAlerts === true
    const hasDelinquency = delinquencyAlerts === true
    
    if (!hasCommission && !hasDelinquency) {
      return NextResponse.json({ 
        error: 'Please select at least one alert type' 
      }, { status: 400 })
    }
    
    // Check if validator exists
    const validator = await sql`
      SELECT vote_pubkey FROM validators WHERE vote_pubkey = ${votePubkey}
    `
    
    if (validator.length === 0) {
      return NextResponse.json({ 
        error: 'Validator not found' 
      }, { status: 404 })
    }
    
    // Upsert subscription
    await sql`
      INSERT INTO validator_subscriptions (
        email, 
        vote_pubkey, 
        commission_alerts, 
        delinquency_alerts,
        delivery_method
      )
      VALUES (
        ${email}, 
        ${votePubkey}, 
        ${hasCommission}, 
        ${hasDelinquency},
        'email'
      )
      ON CONFLICT (email, vote_pubkey) 
      DO UPDATE SET 
        commission_alerts = ${hasCommission},
        delinquency_alerts = ${hasDelinquency},
        updated_at = NOW()
    `
    
    console.log(`✅ Validator subscription created: ${email} -> ${votePubkey} (commission: ${hasCommission}, delinquency: ${hasDelinquency})`)
    
    return NextResponse.json({ 
      success: true,
      message: 'Successfully subscribed to validator alerts'
    })
    
  } catch (error: any) {
    console.error('❌ Validator subscribe error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to subscribe' 
    }, { status: 500 })
  }
}

