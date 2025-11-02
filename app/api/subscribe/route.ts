import { sql } from '@/lib/db-neon'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { email, preferences } = await req.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }
    
    // Default to "rugs_only" if not specified
    const alertPreference = preferences || 'rugs_only'
    
    // Upsert by email using INSERT ON CONFLICT
    await sql`
      INSERT INTO subscribers (email, preferences)
      VALUES (${email}, ${alertPreference})
      ON CONFLICT (email) 
      DO UPDATE SET preferences = ${alertPreference}, updated_at = NOW()
    `
    
    console.log(`✅ Subscribed: ${email} (${alertPreference})`)
    
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('❌ Subscribe error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
