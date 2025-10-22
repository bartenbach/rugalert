# Airtable Schema - Required Fields

## `daily_uptime` Table

**Purpose:** Track validator uptime on a per-day basis

| Field Name | Airtable Type | Format/Details | Description |
|------------|---------------|----------------|-------------|
| `key` | Single line text | Format: `{votePubkey}-{YYYY-MM-DD}` | Unique composite key. Example: `ABC123...-2025-10-22` |
| `votePubkey` | Single line text | Base58 encoded, ~44 chars | Validator's vote account pubkey |
| `date` | Date | YYYY-MM-DD | Date for this uptime record |
| `uptimeChecks` | Number | Integer, 0 decimals | Total checks performed this day (max 1,440 for full day) |
| `delinquentChecks` | Number | Integer, 0 decimals | Number of times found delinquent this day |
| `uptimePercent` | Number | Precision: 2 decimals | Uptime percentage for this day (calculated) |

### Example Records

```
key: "PUmpKiNnSVAZ3w4KaFX6jKSjXUNHFShGkXbERo54xjb-2025-10-22"
votePubkey: "PUmpKiNnSVAZ3w4KaFX6jKSjXUNHFShGkXbERo54xjb"
date: 2025-10-22
uptimeChecks: 1440
delinquentChecks: 10
uptimePercent: 99.31
```

### Important Notes

1. **`key` field is critical** - Must be unique to prevent duplicate records
2. **Date format** - Must be YYYY-MM-DD (ISO 8601 date part)
3. **Numbers only** - `uptimeChecks` and `delinquentChecks` should be integers (no decimals)
4. **Percentage precision** - `uptimePercent` should allow 2 decimal places

### Indexing Recommendations

For optimal performance, consider adding indexes on:
- `votePubkey` (for querying specific validator's history)
- `date` (for date range queries)
- Composite: `votePubkey` + `date` (for lookups)

---

## `validators` Table (Cached Fields)

**Fields cached for performance:**

| Field Name | Airtable Type | Description |
|------------|---------------|-------------|
| `delinquent` | Checkbox | Current delinquency status (boolean) |
| `activeStake` | Number | Current active stake in lamports (cached from RPC) |
| `activatingStake` | Number | Stake currently activating (ephemeral, resets at epoch boundary) |
| `deactivatingStake` | Number | Stake currently deactivating (ephemeral, resets at epoch boundary) |
| `stakeAccountCount` | Number | Number of stake accounts delegated to this validator |
| `jitoEnabled` | Checkbox | Whether validator is Jito MEV-enabled |
| `uptimeChecks` | Number | DEPRECATED - Not used in V3 |
| `delinquentChecks` | Number | DEPRECATED - Not used in V3 |

**Note:** 
- In V3, uptime counters are in `daily_uptime` table, not `validators` table
- `activatingStake` and `deactivatingStake` are ephemeral current state, NOT historical data

---

---

## `stake_history` Table

**Purpose:** Track historical active stake at epoch boundaries

| Field Name | Airtable Type | Description |
|------------|---------------|-------------|
| `key` | Single line text | Format: `{votePubkey}-{epoch}` - Unique composite key |
| `votePubkey` | Single line text | Validator's vote account pubkey |
| `epoch` | Number | Epoch number |
| `activeStake` | Number | Active stake in lamports at this epoch |

**Note:** This table tracks ONLY active stake history. `activatingStake` and `deactivatingStake` are NOT stored here (they're cached in `validators` table as current state).

---

## `performance_history` Table

**Purpose:** Track validator performance metrics per epoch (30-day rolling window)

| Field Name | Airtable Type | Description |
|------------|---------------|-------------|
| `key` | Single line text | Format: `{votePubkey}-{epoch}` - Unique composite key |
| `votePubkey` | Single line text | Validator's vote account pubkey |
| `epoch` | Number | Epoch number |
| `skipRate` | Number | Block skip rate percentage (0-100) |
| `voteCredits` | Number | Vote credits earned in this epoch |
| `voteCreditsPercentage` | Number | Vote credits as % of best performer (0-100) |
| `maxPossibleCredits` | Number | Best performer's vote credits for this epoch |

**Note:** Automatically pruned to keep only last 15 epochs (~30 days). Updated every 15 minutes during current epoch.

---

## Migration Checklist

- [ ] Verify `daily_uptime` table exists
- [ ] Verify all 6 fields exist in `daily_uptime` with correct types
- [ ] Verify `validators` table has `activatingStake` and `deactivatingStake` fields
- [ ] Remove `activatingStake` and `deactivatingStake` fields from `stake_history` table (if they exist)
- [ ] Clear any broken records (optional)
- [ ] Ensure `validators.delinquent` field exists
- [ ] Deploy new code
- [ ] Monitor first cron run for errors

