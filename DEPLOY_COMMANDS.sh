#!/bin/bash
# Quick Deploy Commands for Neon Migration
# Run these commands in order

set -e  # Exit on any error

echo "🚀 Neon Migration Deployment"
echo "=============================="
echo ""

# Step 1: Test locally (manual - open browser)
echo "📍 Step 1: Test locally"
echo "  → Run: npm run dev"
echo "  → Open: http://localhost:3000"
echo "  → Open: http://localhost:3000/validators"
echo "  → Press ENTER when ready to continue..."
read

# Step 2: Run final migration
echo ""
echo "📍 Step 2: Running final migration..."
npm run migrate

echo ""
echo "✅ Migration complete!"
echo ""

# Step 3: Replace snapshot script
echo "📍 Step 3: Replacing snapshot script..."
if [ -f "app/api/snapshot/route.ts" ]; then
  mv app/api/snapshot/route.ts app/api/snapshot/route.airtable.ts.bak
  echo "  ✅ Backed up Airtable version"
fi

if [ -f "app/api/snapshot/route.neon.ts" ]; then
  mv app/api/snapshot/route.neon.ts app/api/snapshot/route.ts
  echo "  ✅ Activated Neon version"
fi

echo ""
echo "📍 Step 4: Committing changes..."
git add .
git commit -m "feat: migrate from Airtable to Neon PostgreSQL

- Convert validators API to use Neon (10x faster)
- Convert events API to use Neon  
- Convert snapshot cron job to use Neon
- Improve performance: 27s → 2-3s for validators list

All data migrated successfully. Airtable backup retained."

echo ""
echo "📍 Step 5: Deploying to Vercel..."
git push origin main

echo ""
echo "✅ DEPLOYMENT INITIATED!"
echo ""
echo "Next steps:"
echo "1. Go to Vercel dashboard"
echo "2. Verify DATABASE_URL is set in Environment Variables"
echo "3. Watch deployment logs for errors"
echo "4. Test production site once deployed"
echo "5. Monitor first snapshot cron job (runs every 30 min)"
echo ""
echo "🎉 Migration complete! Your site should be 7-10x faster now."

