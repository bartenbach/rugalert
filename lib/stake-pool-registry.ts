/**
 * SPL Stake Pool Registry
 *
 * Automatically resolves stake pool names by:
 * 1. Fetching all SPL Stake Pool program accounts
 * 2. Parsing each to extract the pool_mint and derive the withdraw authority PDA
 *    (the withdraw authority PDA is what appears as `authorized.staker` on the
 *    pool's individual stake accounts)
 * 3. Looking up Metaplex token metadata for each pool_mint to get the name
 */

import { PublicKey } from "@solana/web3.js";

const SPL_STAKE_POOL_PROGRAM_ID = new PublicKey(
  "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy"
);
const METAPLEX_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

// Byte offsets in the StakePool account data (borsh-encoded)
const OFFSET_STAKER = 33;            // Pubkey (32 bytes) - operational staker authority
const OFFSET_WITHDRAW_BUMP = 97;     // u8 - bump seed for withdraw authority PDA
const OFFSET_POOL_MINT = 162;        // Pubkey (32 bytes) - the pool's SPL token mint
const MIN_POOL_DATA_LEN = 194;       // minimum bytes needed to parse the fields we care about

async function rpcCall(rpcUrl: string, method: string, params: unknown[] = []) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (!res.ok || json.error)
    throw new Error(JSON.stringify(json.error || res.status));
  return json.result;
}

function readPubkeyFromBuffer(buf: Buffer, offset: number): PublicKey {
  return new PublicKey(buf.subarray(offset, offset + 32));
}

function deriveWithdrawAuthority(
  poolAddress: PublicKey,
  bumpSeed: number
): PublicKey {
  return PublicKey.createProgramAddressSync(
    [
      poolAddress.toBuffer(),
      Buffer.from("withdraw"),
      Buffer.from([bumpSeed]),
    ],
    SPL_STAKE_POOL_PROGRAM_ID
  );
}

function deriveMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      METAPLEX_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    METAPLEX_METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Parse the name (and optionally symbol) from a Metaplex metadata account buffer.
 *
 * Layout (borsh):
 *   key:              u8     (1 byte)
 *   update_authority:  Pubkey (32 bytes)
 *   mint:             Pubkey (32 bytes)
 *   name:             String (4-byte LE length + UTF-8 data, padded with \0)
 *   symbol:           String (4-byte LE length + UTF-8 data, padded with \0)
 */
function parseMetadataNameAndSymbol(
  data: Buffer
): { name: string | null; symbol: string | null } {
  try {
    let offset = 65; // after key (1) + update_authority (32) + mint (32)

    // Parse name
    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    if (nameLen === 0 || nameLen > 100) return { name: null, symbol: null };
    const name = data
      .subarray(offset, offset + nameLen)
      .toString("utf8")
      .replace(/\0+$/, "")
      .trim();
    offset += nameLen;

    // Parse symbol
    if (offset + 4 > data.length) return { name: name || null, symbol: null };
    const symbolLen = data.readUInt32LE(offset);
    offset += 4;
    if (symbolLen === 0 || symbolLen > 30)
      return { name: name || null, symbol: null };
    const symbol = data
      .subarray(offset, offset + symbolLen)
      .toString("utf8")
      .replace(/\0+$/, "")
      .trim();

    return { name: name || null, symbol: symbol || null };
  } catch {
    return { name: null, symbol: null };
  }
}

interface ParsedPool {
  address: string;
  staker: string;
  poolMint: string;
  withdrawAuthority: string;
}

/**
 * Fetch all SPL stake pool names from on-chain data.
 *
 * Returns a Record mapping pubkeys → human-readable pool names.
 * Each pool contributes two keys:
 *   - withdrawAuthority PDA (appears as authorized.staker on stake accounts)
 *   - staker field from the pool struct (operational authority)
 *
 * Uses ~4 RPC calls total (1 getProgramAccounts + batched getMultipleAccountsInfo).
 */
export async function fetchStakePoolNames(
  rpcUrl: string
): Promise<Record<string, string>> {
  console.log("🏊 Fetching SPL stake pool registry...");

  // Step 1: Fetch all accounts owned by the SPL Stake Pool program
  const programAccounts = await rpcCall(rpcUrl, "getProgramAccounts", [
    SPL_STAKE_POOL_PROGRAM_ID.toBase58(),
    { encoding: "base64" },
  ]);

  // Step 2: Parse each account to extract staker, pool_mint, withdraw authority
  const pools: ParsedPool[] = [];
  for (const item of programAccounts) {
    const dataArr = item.account.data;
    const data = Buffer.from(dataArr[0], "base64");

    // Filter: account_type must be 1 (StakePool), not 2 (ValidatorList) etc.
    if (data[0] !== 1) continue;
    if (data.length < MIN_POOL_DATA_LEN) continue;

    const poolAddress = new PublicKey(item.pubkey);
    const staker = readPubkeyFromBuffer(data, OFFSET_STAKER).toBase58();
    const bumpSeed = data[OFFSET_WITHDRAW_BUMP];
    const poolMint = readPubkeyFromBuffer(data, OFFSET_POOL_MINT).toBase58();

    let withdrawAuthority: string;
    try {
      withdrawAuthority = deriveWithdrawAuthority(
        poolAddress,
        bumpSeed
      ).toBase58();
    } catch {
      continue;
    }

    pools.push({
      address: poolAddress.toBase58(),
      staker,
      poolMint,
      withdrawAuthority,
    });
  }

  console.log(`🏊 Found ${pools.length} stake pools, fetching token metadata...`);

  // Step 3: Batch-fetch Metaplex metadata for all pool mints
  const BATCH_SIZE = 100;
  const metadataByMint = new Map<string, { name: string; symbol: string | null }>();

  for (let i = 0; i < pools.length; i += BATCH_SIZE) {
    const batch = pools.slice(i, i + BATCH_SIZE);
    const metadataPDAs = batch.map((p) =>
      deriveMetadataPDA(new PublicKey(p.poolMint)).toBase58()
    );

    const response = await rpcCall(rpcUrl, "getMultipleAccounts", [
      metadataPDAs,
      { encoding: "base64" },
    ]);

    const accounts = response.value;
    for (let j = 0; j < batch.length; j++) {
      const account = accounts[j];
      if (!account?.data) continue;

      const buf = Buffer.from(account.data[0], "base64");
      const parsed = parseMetadataNameAndSymbol(buf);
      if (parsed.name) {
        metadataByMint.set(batch[j].poolMint, {
          name: parsed.name,
          symbol: parsed.symbol,
        });
      }
    }
  }

  // Step 4: Build the staker-pubkey → name mapping
  const mapping: Record<string, string> = {};
  let namedCount = 0;

  for (const pool of pools) {
    const meta = metadataByMint.get(pool.poolMint);
    if (!meta) continue;

    namedCount++;
    // Use the full token name (e.g. "Jito Staked SOL", "BlazeStake Staked SOL")
    const displayName = meta.name;

    // The withdraw authority PDA is what appears as authorized.staker on stake accounts
    mapping[pool.withdrawAuthority] = displayName;
    // The staker field is the operational authority — map it too for completeness
    mapping[pool.staker] = displayName;
  }

  console.log(
    `🏊 Resolved names for ${namedCount}/${pools.length} stake pools`
  );
  return mapping;
}
