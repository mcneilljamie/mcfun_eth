/*
# Insert missing MBD lock on Base (lock_id=1)

1. Problem
   - A second lock on Base (lock_id=1) at block 45398172 was never indexed.
   - The lock indexer's catchup mode only scans 10000 blocks from the deployment block,
     so it never reached block 45398172 where this lock event occurred.
   - The lock is for 134,407 MBD tokens by user 0xC427B6E40c708E6ac1E58fA8025fb3ADfd6239,
     locked on 2026-04-30 for 255 days (unlocks ~2026-12-12).

2. Changes
   - Insert the missing lock record into token_locks
   - Uses ON CONFLICT to be idempotent (safe to re-run)

3. Security
   - No RLS changes
   - Data-only insert, no schema changes
*/

INSERT INTO token_locks (
  lock_id,
  user_address,
  token_address,
  token_symbol,
  token_name,
  token_decimals,
  amount_locked,
  lock_duration_days,
  lock_timestamp,
  unlock_timestamp,
  is_withdrawn,
  tx_hash,
  block_number,
  chain_id
) VALUES (
  1,
  '0xc427b6e40c708f0e6ac1e58fa8025fb3adfd6239',
  '0x794c1ef4dec6c6d1c1adec3f67d27d6affdd1c0f',
  'MBD',
  'McBased',
  18,
  '134407664167321570073054',
  255,
  '2026-04-30T21:48:11+00:00',
  '2026-12-12T21:48:11+00:00',
  false,
  '0xc077a78984e8f6a209c912ffe2304c7bd5e5a4754aae40a6aa3c970814284ec8',
  45398172,
  8453
)
ON CONFLICT (lock_id, chain_id) DO UPDATE SET
  token_symbol = EXCLUDED.token_symbol,
  token_name = EXCLUDED.token_name,
  token_decimals = EXCLUDED.token_decimals,
  amount_locked = EXCLUDED.amount_locked,
  lock_duration_days = EXCLUDED.lock_duration_days,
  lock_timestamp = EXCLUDED.lock_timestamp,
  unlock_timestamp = EXCLUDED.unlock_timestamp,
  tx_hash = EXCLUDED.tx_hash,
  block_number = EXCLUDED.block_number;
