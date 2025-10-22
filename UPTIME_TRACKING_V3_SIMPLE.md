# Uptime Tracking V3 - Daily Records (The Right Balance)

## Why V3?

V1: Stored every check for every validator = 1.4M writes/day ❌  
V2: Event-based with timestamps and complex date math = Failed with permissions ❌  
**V3: One record per validator per day = 1,000 writes/day, yearly chart ✅**

## The Design

### Daily Records in `daily_uptime` Table

| Field | Type | Description |
|-------|------|-------------|
| `key` | Text | Composite key: `votePubkey-YYYY-MM-DD` (unique) |
| `votePubkey` | Text | Validator vote pubkey |
| `date` | Date | YYYY-MM-DD |
| `uptimeChecks` | Number | Checks performed today |
| `delinquentChecks` | Number | Times found delinquent today |
| `uptimePercent` | Number | Uptime % for this day |

### How It Works

1. **Cron runs every minute**
2. **For each validator**:
   - UPSERT today's record (update if exists, create if not)
   - Increment `uptimeChecks` by 1
   - If delinquent, increment `delinquentChecks` by 1
   - Recalculate `uptimePercent` for today
3. **Result**: Only 1 record per validator per day!

### Data Volume

**Writes per day:**
- 1,000 validators × 1 record/day = **1,000 new records on day 1**
- Days 2-365: **0 new records** (just updates to existing records)
- Total writes: ~1,000 updates/minute (updating existing records)

**Storage:**
- 1,000 validators × 365 days = **365,000 records per year**
- Compare to V1: 525,000,000 records per year
- **99.93% reduction in storage** 🎉

### The Math

**Daily:**
```
Today's Uptime % = (uptimeChecks - delinquentChecks) / uptimeChecks × 100
```

**Overall (across all days):**
```
Total Checks = sum of all uptimeChecks
Total Delinquent = sum of all delinquentChecks
Overall Uptime % = (Total Checks - Total Delinquent) / Total Checks × 100
```

### Yearly Chart

Display a heatmap (like GitHub contributions):
- Each square = one day
- Green (99-100%), Yellow (95-99%), Orange (90-95%), Red (<90%)
- Hover for details (date, checks, downtime)

### Example

**Day 1 (00:00 - 23:59):**
- 1,440 minute checks (24 hours)
- Delinquent for 10 minutes
- Uptime = (1440 - 10) / 1440 × 100 = **99.31%**

**Day 2:**
- 1,440 more checks
- Delinquent for 0 minutes  
- Uptime = (1440 - 0) / 1440 × 100 = **100%**

**Overall:**
- Total checks = 2,880
- Total delinquent = 10
- Overall = (2880 - 10) / 2880 × 100 = **99.65%**

### Key Fix from V1

**V1 Bug:** Created NEW record every minute
```javascript
// Wrong (V1):
create({ votePubkey, date, uptimeChecks: 1, ... })  // Every minute!
```

**V3 Fix:** UPSERT based on key
```javascript
// Right (V3):
existing = find where key = "votePubkey-2025-10-22"
if (existing) {
  update(existing.id, { uptimeChecks: existing.uptimeChecks + 1, ... })
} else {
  create({ key: "votePubkey-2025-10-22", ... })
}
```

### Migration

**Existing `daily_uptime` table is perfect!** Just need to:
1. **Clear old broken records** (optional, or they'll age out)
2. **Deploy new code** with UPSERT logic
3. **Done!**

Fields needed (should already exist):
- `key` (Single line text)
- `votePubkey` (Single line text)
- `date` (Date)
- `uptimeChecks` (Number)
- `delinquentChecks` (Number)
- `uptimePercent` (Number)

### Benefits

✅ **Efficient**: 1,000 records/day (not 1.4M)  
✅ **Yearly chart**: Can display full year of history  
✅ **Accurate**: Every minute checking  
✅ **Scalable**: Works with 10,000+ validators  
✅ **Simple**: No complex event logic  
✅ **Uses existing table**: No schema changes needed  

### Monitoring

After deployment, check logs:
```
📊 Network: 995 active, 5 delinquent
📅 Processing date: 2025-10-22
📦 Found 995 existing records for today
📝 Updating 995 records, creating 5 records  ← First run of the day
✅ Updated 995 records, created 5 records
```

Next minute:
```
📦 Found 1000 existing records for today
📝 Updating 1000 records, creating 0 records  ← All subsequent runs
✅ Updated 1000 records, created 0 records
```

**Perfect!**
