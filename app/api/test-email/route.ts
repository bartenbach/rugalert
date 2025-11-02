import { sql } from '@/lib/db-neon'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const logs: string[] = []
    
    // Check environment variables
    logs.push("=== Environment Check ===")
    logs.push(`RESEND_API_KEY: ${process.env.RESEND_API_KEY ? 'SET ✓' : 'MISSING ✗'}`)
    logs.push(`ALERTS_FROM: ${process.env.ALERTS_FROM || 'MISSING ✗'}`)
    logs.push("")
    
    // Fetch subscribers
    logs.push("=== Fetching Subscribers ===")
    const subs = await sql`SELECT email, preferences FROM subscribers`
    logs.push(`Total subscribers: ${subs.length}`)
    logs.push("")
    
    // Analyze each subscriber
    logs.push("=== Subscriber Details ===")
    for (const sub of subs) {
      logs.push(`  • ${sub.email}`)
      logs.push(`    Preference: ${sub.preferences || "UNDEFINED (will default to rugs_only)"}`)
    }
    logs.push("")
    
    // Test email filtering for RUG event
    logs.push("=== Email Filtering Test (RUG Event) ===")
    const eligibleForRug = subs.filter((s) => {
      const email = s.email
      if (!email) return false
      
      const preference = s.preferences || "rugs_only"
      
      return preference === "all" || 
             preference === "rugs_and_cautions" || 
             preference === "rugs_only"
    })
    logs.push(`Eligible recipients for RUG: ${eligibleForRug.length}`)
    eligibleForRug.forEach(s => logs.push(`  • ${s.email}`))
    logs.push("")
    
    // Actually send a test email if requested
    const shouldSend = req.nextUrl.searchParams.get('send') === 'true'
    
    if (shouldSend && process.env.RESEND_API_KEY && process.env.ALERTS_FROM) {
      logs.push("=== Attempting to Send Test Email ===")
      
      const to = eligibleForRug.map((s) => s.email).filter(Boolean)
      
      if (to.length === 0) {
        logs.push("❌ No eligible recipients!")
      } else {
        logs.push(`Sending to: ${to.join(", ")}`)
        
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            from: process.env.ALERTS_FROM, 
            to, 
            subject: "RugAlert Test Email", 
            text: "This is a test email from RugAlert. If you're receiving this, email notifications are working! 🚨\n\nThis was triggered by visiting /api/test-email?send=true" 
          }),
        })
        
        const result = await response.json()
        logs.push(`Response status: ${response.status}`)
        logs.push(`Response body: ${JSON.stringify(result, null, 2)}`)
        
        if (!response.ok) {
          logs.push(`❌ Email failed!`)
        } else {
          logs.push(`✅ Email sent successfully!`)
        }
      }
    } else if (!shouldSend) {
      logs.push("=== Test Email Not Sent ===")
      logs.push("To actually send a test email, add ?send=true to the URL")
      logs.push("Example: /api/test-email?send=true")
    }
    
    return NextResponse.json({ 
      logs,
      note: "Add ?send=true to the URL to actually send a test email"
    }, { 
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message || String(error),
      stack: error.stack
    }, { status: 500 })
  }
}

