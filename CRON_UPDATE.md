# ⏱️ Cron Schedule Update

## What Changed

The cron schedule has been updated from **every 2 hours** to **every 15 minutes** for faster RUG detection!

---

## 📋 Changes Made

### 1. **vercel.json**
```json
{
  "crons": [
    {
      "path": "/api/snapshot",
      "schedule": "*/15 * * * *"  // Every 15 minutes
    }
  ]
}
```

**Previous:** `0 */2 * * *` (every 2 hours at the top of the hour)  
**New:** `*/15 * * * *` (every 15 minutes)

---

## ⚡ Benefits

### **Faster Detection**
- 🚨 RUGs detected within **15 minutes** (vs 2 hours before)
- ⚠️ Commission changes caught much faster
- 🔔 Notifications sent sooner

### **Still Efficient**
- ✅ Uses **delta-only writes** (only records changes)
- ✅ Most cron runs will write 0-5 records (if no changes)
- ✅ First run writes all validators (~1500-2000)
- ✅ Subsequent runs only write when commissions change

### **Airtable Rate Limits**
- ✅ Should be fine - delta-only design prevents excessive writes
- ✅ Monitor your Airtable usage dashboard
- ✅ Upgrade plan if needed (unlikely on free tier)

---

## 📊 Expected Performance

### **First Run** (after deployment)
- Duration: ~30-60 seconds
- Writes: ~1500-2000 records (all validators + snapshots)
- This only happens once!

### **Subsequent Runs** (every 15 minutes)
- Duration: ~5-15 seconds
- Writes: 0-10 records typically (only if commissions changed)
- RUGs: Usually 0-2 per day (historically)
- Cautions: Variable, but usually <10 per day
- Info events: Depends on small commission adjustments

### **During Active RUG Period**
- Might see 3-5 events per 15 minutes
- Still well within Airtable limits

---

## 🚀 After Deployment

Once you deploy with the updated `vercel.json`, the new schedule takes effect automatically!

### **Verify It's Working:**

1. **Check Vercel Cron Settings:**
   - Vercel Dashboard → Your Project → Settings → Cron Jobs
   - Should show: "Every 15 minutes"

2. **Watch the Logs:**
   - Vercel Dashboard → Deployments → Functions
   - Look for `/api/snapshot` executions every 15 minutes

3. **Monitor Your Dashboard:**
   - Visit your site
   - Click "🚨 Test Alert" to make sure the siren still works! 😄
   - Watch the "Last update" timestamp - should update every 15 minutes

---

## 📈 Monitoring

### **Good Signs:**
- ✅ Cron runs every 15 minutes
- ✅ Most runs show 0-5 snapshots created
- ✅ Events appear when commissions actually change
- ✅ No Airtable rate limit errors

### **Warning Signs:**
- ⚠️ Cron skipping executions
- ⚠️ Airtable rate limit errors
- ⚠️ Long execution times (>60 seconds)

### **If You See Issues:**
1. Check RPC endpoint reliability
2. Monitor Airtable usage
3. Review Vercel function logs
4. Consider upgrading Airtable plan if hitting limits

---

## 🎯 Real-Time Monitoring

Remember, your dashboard also has **auto-refresh every 5 seconds**! 

So you get:
- 🔄 **Background cron:** Every 15 minutes (catches changes)
- 🔄 **Dashboard refresh:** Every 5 seconds (when page is open)
- 🚨 **Instant alerts:** When new RUG detected (with that awesome siren! 😄)

---

## 💡 Tips

### **For Maximum Coverage:**
1. **Deploy with new cron schedule** (already done in vercel.json)
2. **Leave dashboard open on a monitor** (auto-refresh will catch changes every 5 seconds)
3. **Enable notifications:**
   - Discord webhook
   - Telegram bot
   - Email alerts
4. **Monitor the health regularly**

### **If 15 Minutes is Too Frequent:**
You can adjust in `vercel.json`:
- `*/30 * * * *` = Every 30 minutes
- `0 * * * *` = Every hour (on the hour)
- `*/5 * * * *` = Every 5 minutes (aggressive!)

---

## 🎊 You're All Set!

Your RugAlert now:
- ✅ Checks every **15 minutes** (96 times per day)
- ✅ Dashboard refreshes every **5 seconds** (when open)
- ✅ **Instant siren alerts** with flashing lights and sound 🚨
- ✅ Multi-channel notifications (Discord, Telegram, Email)
- ✅ Real-time monitoring with live status indicator

**You'll catch those RUGs fast!** 🎃⚡

---

## 🚀 Deploy Now

```bash
git add .
git commit -m "Update cron to run every 15 minutes for faster RUG detection"
git push
```

Vercel will automatically deploy with the new cron schedule! 🎉

