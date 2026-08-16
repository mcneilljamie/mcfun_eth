/*
# Permanently preserve all historical trade data

## Problems Fixed
1. Cleanup cron jobs were deleting price_snapshots older than 90 days
2. Cleanup cron was deleting eth_price_history older than 90 days
3. price_snapshots had no unique constraint, allowing duplicates
4. swaps unique constraint was only on tx_hash, which breaks for
   multiple swaps in the same transaction
5. price_snapshots lacked chain-aware identity and trade-level columns

## Changes
1. Unschedule cleanup-old-price-snapshots cron job
2. Unschedule cleanup-old-eth-price-history cron job
3. Make cleanup_old_price_snapshots and cleanup_old_eth_price_history
   functions no-ops (return 0) so any future callers do nothing
4. Add chain-aware unique constraint to swaps: (chain_id, tx_hash, log_index)
   - Drop old tx_hash unique constraint
5. Add trade-level columns to price_snapshots:
   - transaction_hash, transaction_index, log_index, block_timestamp
   - trade_direction, eth_amount, token_amount
   - post_trade_eth_reserve, post_trade_token_reserve
   - market_cap_usd, is_reconstructed
6. Add chain-aware unique constraint to price_snapshots:
   (chain_id, transaction_hash, log_index) for trade-based snapshots
7. Add composite index on (token_address, chain_id, created_at) for chart queries
8. Add index on (chain_id, block_number) for backfill queries

## Security
- No RLS changes
- No data deletion
- Only additive schema changes and cron unscheduling
*/

-- 1. Unschedule cleanup crons that delete historical data
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-old-price-snapshots';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-old-eth-price-history';

-- 2. Make cleanup functions no-ops so any future callers do nothing
CREATE OR REPLACE FUNCTION cleanup_old_price_snapshots()
RETURNS TABLE (
  deleted_count BIGINT,
  oldest_remaining TIMESTAMPTZ,
  execution_time_ms INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No-op: historical trade data must be preserved permanently
  RETURN QUERY SELECT 0::BIGINT, NULL::TIMESTAMPTZ, 0::INTEGER;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_old_eth_price_history()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No-op: historical ETH price data must be preserved permanently
  RETURN 0;
END;
$$;

-- 3. Add trade-level columns to price_snapshots
ALTER TABLE price_snapshots
  ADD COLUMN IF NOT EXISTS transaction_hash text,
  ADD COLUMN IF NOT EXISTS transaction_index integer,
  ADD COLUMN IF NOT EXISTS log_index integer,
  ADD COLUMN IF NOT EXISTS block_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS trade_direction text,
  ADD COLUMN IF NOT EXISTS eth_amount numeric,
  ADD COLUMN IF NOT EXISTS token_amount numeric,
  ADD COLUMN IF NOT EXISTS post_trade_eth_reserve numeric,
  ADD COLUMN IF NOT EXISTS post_trade_token_reserve numeric,
  ADD COLUMN IF NOT EXISTS market_cap_usd numeric,
  ADD COLUMN IF NOT EXISTS is_reconstructed boolean DEFAULT false;

-- 4. Add log_index to swaps table
ALTER TABLE swaps
  ADD COLUMN IF NOT EXISTS transaction_index integer,
  ADD COLUMN IF NOT EXISTS log_index integer;

-- 5. Drop old swaps unique constraint (tx_hash alone) and add chain-aware one
-- First check if old constraint exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'swaps_tx_hash_unique' AND conrelid = 'swaps'::regclass
  ) THEN
    ALTER TABLE swaps DROP CONSTRAINT swaps_tx_hash_unique;
  END IF;
END $$;

-- Add new chain-aware unique constraint for swaps
-- This allows the same tx_hash to have multiple swaps (different log indices)
-- while preventing duplicates of the exact same event
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'swaps_chain_tx_log_unique' AND conrelid = 'swaps'::regclass
  ) THEN
    ALTER TABLE swaps ADD CONSTRAINT swaps_chain_tx_log_unique UNIQUE (chain_id, tx_hash, log_index);
  END IF;
END $$;

-- 6. Add chain-aware unique constraint to price_snapshots
-- This allows one snapshot per unique trade event
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'price_snapshots_chain_tx_log_unique' AND conrelid = 'price_snapshots'::regclass
  ) THEN
    ALTER TABLE price_snapshots ADD CONSTRAINT price_snapshots_chain_tx_log_unique
      UNIQUE (chain_id, transaction_hash, log_index);
  END IF;
END $$;

-- 7. Add performance indexes for chart queries and backfill
CREATE INDEX IF NOT EXISTS idx_price_snapshots_token_chain_time
  ON price_snapshots (token_address, chain_id, created_at);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_chain_block
  ON price_snapshots (chain_id, block_number);

CREATE INDEX IF NOT EXISTS idx_swaps_token_chain_block
  ON swaps (token_address, chain_id, block_number);

CREATE INDEX IF NOT EXISTS idx_swaps_chain_block
  ON swaps (chain_id, block_number);
