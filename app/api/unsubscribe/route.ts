import { tb } from '@/lib/airtable'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }
    
    // Find subscriber by email
    const found = await tb.subs.select({ 
      filterByFormula: `{email} = "${email}"`, 
      maxRecords: 1 
    }).firstPage()
    
    if (!found[0]) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }
    
    // Delete the subscription
    await tb.subs.destroy([found[0].id])
    
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

