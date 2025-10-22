# Uptime Tracking V2 - Event-Based Design

## Problem with V1
The original design stored minute-by-minute updates for every validator:
- 1,000 validators × 1 update/minute = 1,000 updates/minute
- 1,440,000 updates per day = massive unnecessary writes
- Airtable was filling up with duplicate/useless data

## New Event-Based Design (V2)

### Core Concept
**Only store state CHANGES, not every check.**

Instead of storing:
```
Validator A - 2025-10-22 12:00 - UP
Validator A - 2025-10-22 12:01 - UP  ← waste
Validator A - 2025-10-22 12:02 - UP  ← waste
Validator A - 2025-10-22 12:03 - DOWN
```

We store:
```
Validator A - 2025-10-22 12:03 - WENT_DOWN
Validator A - 2025-10-22 12:15 - CAME_UP
```

### Airtable Schema

#### `delinquency_events` Table (NEW)
| Field | Type | Description |
|-------|------|-------------|
| `votePubkey` | Single line text | Validator vote pubkey |
| `eventType` | Single select | Either "WENT_DOWN" or "CAME_UP" |
| `timestamp` | Date | ISO timestamp of state change |

#### `validators` Table (Updated)
Existing table, add if missing:
| Field | Type | Description |
|-------|------|-------------|
| `delinquent` | Checkbox | Current delinquency state |

### How It Works

1. **Cron runs every minute** for maximum accuracy
2. **Fetches current state** from Solana RPC
3. **Compares** with last known state in `validators` table
4. **Only writes if state changed**:
   - Creates event in `delinquency_events`
   - Updates `validators.delinquent` flag
5. **Most runs = zero writes** (validators don't flip constantly)

### Data Volume Comparison

**V1 (Broken):**
- 1,000 validators × 1 update/min = 1,440,000 writes/day
- 1,000 validators × 365 days = 365,000,000 rows per year
- Every check wrote to database (even when nothing changed)

**V2 (Fixed - Event-Based):**
- **Checks every minute** (1,440 checks/day for accuracy)
- **Only writes on state changes** (~10-100 validators change state per day)
- ~200 events/day × 365 = ~73,000 events per year
- **99.98% reduction in writes** 🎉
- 1,440 checks with ~2 writes = smart design

### Uptime Calculation

The `/api/uptime/[votePubkey]` endpoint:
1. Fetches all events for the validator
2. Calculates downtime periods from events
3. Distributes downtime across affected days
4. Returns daily uptime percentages

Example:
```
Event 1: WENT_DOWN at 2025-10-22 14:30
Event 2: CAME_UP at 2025-10-22 16:45
→ 2h 15min downtime on Oct 22
→ 90.6% uptime for that day
```

### Migration Steps

1. ✅ **Create `delinquency_events` table** in Airtable
   - Add fields: `votePubkey`, `eventType`, `timestamp`

2. ✅ **Ensure `validators.delinquent` field** exists
   - Type: Checkbox
   - This tracks current state

3. ✅ **Deploy the new code**
   - Delinquency-check cron now event-based
   - Uptime API now calculates from events

4. **Clean up old `daily_uptime` table** (optional)
   - Can be deleted after migration
   - Or kept as backup

### Benefits

1. **Efficiency**: 99.99% fewer writes
2. **Accuracy**: Event timestamps are precise
3. **Scalability**: Works with 10,000+ validators
4. **Cost**: Drastically reduced Airtable API usage
5. **Flexibility**: Easy to query historical downtime events

### Monitoring

After deployment, check logs for:
```
🩺 === DELINQUENCY CHECK START (Event-based) ===
📊 Network status: 995 active, 5 delinquent
📦 Loaded 1000 validators from DB
🔔 Detected 3 state changes
✅ Created 3 delinquency events
✅ Updated 3 validator states
✅ No state changes - no writes needed  ← Most of the time!
```

Most checks should result in **zero writes** because validators don't constantly flip between up/down.

