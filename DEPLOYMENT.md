# Deployment Guide

## ✅ Prerequisites

1. **Airtable Account** - Free tier works fine
2. **Vercel Account** - Free tier works great
3. **Resend Account** (optional) - For email alerts
4. **Solana RPC URL** - Free public RPC or paid service (Helius, QuickNode)

---

## 📊 Step 1: Set Up Airtable

### Create a new Airtable Base with 4 tables:

#### 1. **validators**
Fields:
- `votePubkey` (Single line text, Primary)
- `identityPubkey` (Single line text)
- `name` (Single line text)
- `iconUrl` (URL)
- `website` (URL, optional)

#### 2. **snapshots**
Fields:
- `key` (Single line text, Primary - auto-generated as `{votePubkey}-{slot}`)
- `votePubkey` (Single line text)
- `epoch` (Number)
- `slot` (Number)
- `commission` (Number)
- `observedAt` (Created time, auto)

#### 3. **events**
Fields:
- `votePubkey` (Single line text)
- `epoch` (Number)
- `type` (Single select: **RUG**, **CAUTION**, **INFO**)  ⚠️ Make sure to add all three options!
- `fromCommission` (Number)
- `toCommission` (Number)
- `delta` (Number)
- `createdAt` (Created time, auto)

#### 4. **subscribers**
Fields:
- `email` (Email, Primary)
- `createdAt` (Created time, auto)

### Get your credentials:
1. Go to https://airtable.com/create/tokens
2. Create a token with `data.records:read` and `data.records:write` scopes
3. Select your base
4. Copy the token (starts with `pat_...`)
5. Get your Base ID from the Airtable URL: `https://airtable.com/appXXXXXXXXXXXX/...`

---

## 📧 Step 2: Set Up Email (Optional but Recommended)

1. Go to https://resend.com and sign up
2. Verify your domain (or use their test domain for development)
3. Create an API key
4. Note your "from" email address (e.g., `alerts@rugdetector.pumpkinspool.com`)

> **Note**: Emails are sent ONLY for RUG events (commission → 100%), not for INFO or CAUTION events.

---

## 🚀 Step 3: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Easiest)

1. **Push your code to GitHub**
   ```bash
   cd /Users/blake/Downloads/rugdetector
   
   # IMPORTANT: Verify .gitignore exists and includes .env*.local
   cat .gitignore | grep ".env"
   
   # Initialize git repo
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/rugdetector.git
   git push -u origin main
   ```
   
   **⚠️ CRITICAL**: Your `.env.local` file is excluded by `.gitignore` and will NOT be pushed to GitHub. Secrets stay local!

2. **Import to Vercel**
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - Vercel will auto-detect Next.js

3. **Add Environment Variables in Vercel Dashboard**
   
   **⚠️ NEVER commit secrets to GitHub!** Add them only in Vercel's dashboard:
   
   - Go to Vercel → Project Settings → Environment Variables
   - Add each variable individually (copy from your local `.env.local` file)
   - Make sure to select "Production", "Preview", and "Development" for each
   
   **Required variables:**
   ```
   AIRTABLE_API_KEY=pat_xxxxxxxxxxxxxxxxxxxxx
   AIRTABLE_BASE_ID=appxxxxxxxxxxxxx
   AIRTABLE_TB_VALIDATORS=validators
   AIRTABLE_TB_SNAPSHOTS=snapshots
   AIRTABLE_TB_EVENTS=events
   AIRTABLE_TB_SUBSCRIBERS=subscribers
   RPC_URL=https://api.mainnet-beta.solana.com
   CRON_SECRET=your_long_random_secret_32_chars_minimum
   BASE_URL=https://your-project.vercel.app
   ```
   
   **Optional variables (for email alerts):**
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
   ALERTS_FROM=alerts@rugdetector.pumpkinspool.com
   ```
   
   **Optional (for Discord alerts):**
   ```
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   ```

4. **Deploy!**
   - Vercel will automatically deploy
   - The cron job in `vercel.json` will be automatically configured

### Option B: Deploy via CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

Then add environment variables via the dashboard.

---

## ⚙️ Step 4: Configure Custom Domain (Optional)

1. In Vercel → Project Settings → Domains
2. Add `rugdetector.pumpkinspool.com`
3. Add the CNAME record to your DNS:
   ```
   CNAME rugdetector -> cname.vercel-dns.com
   ```
4. Update `BASE_URL` environment variable to your custom domain

---

## 🔄 Step 5: Trigger First Snapshot

The cron runs every 2 hours, but you should trigger the first snapshot manually:

```bash
curl -X POST https://your-project.vercel.app/api/snapshot \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

This will:
- Fetch all current Solana validators
- Store their commission rates
- Populate the validators table with names and icons

**Expected response:**
```json
{"ok": true, "epoch": 123, "slot": 456789}
```

---

## 📊 Step 6: Verify Everything Works

1. **Check the dashboard**: Visit your deployed URL
2. **Check Airtable**: 
   - `validators` table should have ~1500-2000 rows
   - `snapshots` table should have ~1500-2000 rows
   - `events` table will be empty until commissions change
3. **Test email subscription**: 
   - Subscribe with your email
   - Check `subscribers` table in Airtable
4. **Monitor cron logs**: Vercel → Deployments → Functions

---

## 🔍 Monitoring

### Cron Schedule
- Runs every 2 hours (defined in `vercel.json`)
- Checks all validators for commission changes
- Creates events for ANY change (RUG, CAUTION, or INFO)
- Sends email alerts ONLY for RUGs

### Check Cron Logs
- Vercel Dashboard → Your Project → Deployments
- Click on the deployment → Functions
- Look for `/api/snapshot` logs

### Health Check
```bash
curl https://your-project.vercel.app/api/health
```

---

## 🔒 Security Best Practices

1. **NEVER commit `.env.local` to GitHub** - It's in `.gitignore`, keep it that way!
2. **Environment variables go in Vercel dashboard only** - Not in code
3. **Use a strong CRON_SECRET** - At least 32 random characters
4. **Rotate secrets regularly** - Especially if they're ever exposed
5. **Limit Airtable token permissions** - Only give `data.records:read` and `data.records:write`

---

## 🛠️ Troubleshooting

### Issue: No validators appearing
**Solution**: Manually trigger the snapshot endpoint (see Step 5)

### Issue: Email not sending
**Solutions**:
- Check RESEND_API_KEY is valid
- Verify domain in Resend dashboard
- Check ALERTS_FROM matches your verified domain
- Look at Vercel function logs for errors

### Issue: Cron not running
**Solutions**:
- Ensure `vercel.json` exists
- Check CRON_SECRET matches in env vars
- Verify cron is enabled in Vercel project settings

### Issue: Airtable rate limits
**Solutions**:
- Keep 2-hour cron interval (don't speed up)
- Consider upgrading Airtable plan if needed
- The current design is optimized for free tier

---

## 🎯 Post-Deployment

1. **Share the URL** with your community
2. **Test subscribe flow** with a few emails
3. **Wait for commission changes** to see events populate
4. **Monitor Airtable usage** to ensure you stay within limits

---

## 💡 Tips

- The first snapshot takes ~30-60 seconds (processes all validators)
- Subsequent snapshots are faster (only records changes)
- RPC calls can fail - consider using a paid RPC provider (Helius, QuickNode)
- Discord webhook is optional but nice for real-time RUG alerts
- Email alerts go to ALL subscribers for RUG events only

---

## 🆘 Need Help?

Common issues are usually:
1. Missing environment variables
2. Wrong Airtable table names or field types
3. Invalid RPC URL
4. Missing CRON_SECRET header

Check Vercel function logs for detailed error messages!

