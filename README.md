# RugDetector (Airtable Edition)

A tiny Next.js app that flags Solana validators who hike commission (RUG = to 100%) and cautions on big jumps (≥10pp). Uses **Airtable** for storage.

## Features
- RED: any hop **to 100%** commission
- YELLOW: a rise **≥ 10 percentage points** (with final commission < 100)
- Dashboard for last-N-epochs
- History of past rugs (paginated)
- Per-validator commission chart (epochs vs %)
- Subscribe form (emails via Resend, optional)
- Discord webhook (optional)
- Vercel Cron snapshotter (every 15 minutes)

## Airtable Base
Create 4 tables with these **exact** names (lowercase is fine):
- `validators`: fields `votePubkey` (text), `identityPubkey` (text), `name` (text), `avatarUrl` (url)
- `snapshots`: fields `key` (text, unique `${votePubkey}-${epoch}`), `votePubkey` (text), `epoch` (number), `slot` (number), `commission` (number), `observedAt` (created time)
- `events`: fields `votePubkey` (text), `epoch` (number), `type` (single select: RUG, CAUTION), `fromCommission` (number), `toCommission` (number), `delta` (number), `createdAt` (created time)
- `subscribers`: fields `email` (email), `createdAt` (created time)

## Environment Variables
Copy `.env.example` to `.env.local` and fill with your actual values.

**⚠️ IMPORTANT**: Never commit `.env.local` to git! It's already in `.gitignore`.
```
AIRTABLE_API_KEY=pat_xxx
AIRTABLE_BASE_ID=app_xxx
AIRTABLE_TB_VALIDATORS=validators
AIRTABLE_TB_SNAPSHOTS=snapshots
AIRTABLE_TB_EVENTS=events
AIRTABLE_TB_SUBSCRIBERS=subscribers

RPC_URL=https://your.solana.rpc
CRON_SECRET=long_random
BASE_URL=https://rugdetector.pumpkinspool.com

# Optional
RESEND_API_KEY=
ALERTS_FROM=alerts@rugdetector.pumpkinspool.com
DISCORD_WEBHOOK_URL=
```

## Develop
```
npm install
npm run dev
```

## Deploy (Vercel recommended)
1. Push to GitHub and import the repo in Vercel.
2. Add env vars from `.env.local` to Vercel → Project Settings → Environment Variables.
3. Ensure `vercel.json` exists (sets a 15-minute cron to `/api/snapshot` with header `x-cron-secret`).
4. Deploy. Point `rugdetector.pumpkinspool.com` CNAME at Vercel.
5. Manually trigger a first snapshot (e.g., curl with header):  
   `curl -X POST https://<vercel-deployment>/api/snapshot -H "x-cron-secret: <CRON_SECRET>"`

## Notes
- Name + Avatar enrichment: by default uses a deterministic DiceBear identicon and a shortened vote key. Replace `lib/enrich.ts` with a real metadata fetch if desired.
- Cron runs every 15 minutes to catch commission changes quickly. The snapshot endpoint uses delta-only writes (only records changes), so Airtable rate limits should be fine.
- History and events endpoints do simple hydration (join) at request time. For scale, denormalize name/avatar into events during snapshot.
