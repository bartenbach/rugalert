import { sql } from '@/lib/db-neon'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }
    
    // Delete the subscription
    const result = await sql`
      DELETE FROM subscribers 
      WHERE email = ${email}
      RETURNING id
    `
    
    if (result.length === 0) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }
    
    console.log(`✅ Unsubscribed: ${email}`)
    
    return NextResponse.json({ 
      success: true, 
      message: 'Successfully unsubscribed' 
    })
  } catch (e: any) {
    console.error('❌ Unsubscribe error:', e)
    return NextResponse.json({ 
      error: String(e?.message || e) 
    }, { status: 500 })
  }
}

