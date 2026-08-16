/*
# Fix Lock Indexer for Multi-Chain Support

1. Problems Fixed
   - Display functions (get_all_locks_with_values_paginated, get_locks_by_token_address_paginated,
     get_token_lock_stats) joined tokens table on token_address only, missing chain_id.
     This caused incorrect price lookups when the same token address exists on multiple chains
     or when a Base token had no matching Ethereum token row.
   - Legacy cron jobs (index-lock-events-catchup, index-lock-events-optimized) called the
     lock-event-indexer without a chain_id parameter, defaulting to Ethereum and competing
     with the proper per-chain jobs.
   - The MBD (McBased) lock on Base (lock_id=0, chain_id=8453) was incorrectly marked as
     withdrawn because the sync-lock-withdrawals function checked it against Ethereum's
     locker contract instead of Base's locker contract.

2. Changes
   - DROP and recreate get_all_locks_with_values_paginated with chain_id in return type
     and JOIN on both token_address AND chain_id
   - DROP and recreate get_locks_by_token_address_paginated with chain_id in return type
     and JOIN on both token_address AND chain_id
   - Update get_token_lock_stats to LEFT JOIN tokens on both token_address AND chain_id
   - Remove legacy cron jobs: index-lock-events-catchup, index-lock-events-optimized
   - Reset the MBD lock on Base to is_withdrawn=false so it displays correctly

3. Security
   - No changes to RLS policies
   - All functions remain SECURITY DEFINER
   - Read-only functions, no data exposure changes
*/

-- Drop functions that need return type changes (adding chain_id column)
DROP FUNCTION IF EXISTS get_all_locks_with_values_paginated(integer, integer);
DROP FUNCTION IF EXISTS get_locks_by_token_address_paginated(text, integer, integer);

-- Recreate get_all_locks_with_values_paginated with chain_id and proper multi-chain JOIN
CREATE OR REPLACE FUNCTION get_all_locks_with_values_paginated(
  page_limit integer DEFAULT 20,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  lock_id bigint,
  user_address text,
  token_address text,
  token_symbol text,
  token_name text,
  token_decimals integer,
  amount_locked text,
  lock_duration_days integer,
  lock_timestamp timestamptz,
  unlock_timestamp timestamptz,
  is_withdrawn boolean,
  tx_hash text,
  chain_id integer,
  value_eth numeric,
  value_usd numeric,
  current_price_eth numeric,
  current_price_usd numeric,
  total_count bigint
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH counted AS (
    SELECT COUNT(*) as total
    FROM token_locks tl
    WHERE tl.is_withdrawn = false
  )
  SELECT
    tl.id,
    tl.lock_id,
    tl.user_address,
    tl.token_address,
    tl.token_symbol,
    tl.token_name,
    tl.token_decimals,
    tl.amount_locked::text,
    tl.lock_duration_days,
    tl.lock_timestamp,
    tl.unlock_timestamp,
    tl.is_withdrawn,
    tl.tx_hash,
    tl.chain_id,
    COALESCE(
      (tl.amount_locked::numeric / (10::numeric ^ tl.token_decimals)) *
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)),
      0
    )::numeric as value_eth,
    COALESCE(
      (tl.amount_locked::numeric / (10::numeric ^ tl.token_decimals)) *
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    )::numeric as value_usd,
    COALESCE(
      t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0),
      0
    )::numeric as current_price_eth,
    COALESCE(
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    )::numeric as current_price_usd,
    counted.total::bigint as total_count
  FROM token_locks tl
  LEFT JOIN tokens t ON t.token_address = tl.token_address AND t.chain_id = tl.chain_id
  CROSS JOIN counted
  WHERE tl.is_withdrawn = false
  ORDER BY tl.created_at DESC
  LIMIT page_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;

-- Recreate get_locks_by_token_address_paginated with chain_id and proper multi-chain JOIN
CREATE OR REPLACE FUNCTION get_locks_by_token_address_paginated(
  token_addr text,
  page_limit integer DEFAULT 20,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  lock_id bigint,
  user_address text,
  token_address text,
  token_symbol text,
  token_name text,
  token_decimals integer,
  amount_locked text,
  lock_duration_days integer,
  lock_timestamp timestamptz,
  unlock_timestamp timestamptz,
  is_withdrawn boolean,
  tx_hash text,
  withdraw_tx_hash text,
  chain_id integer,
  value_eth numeric,
  value_usd numeric,
  current_price_eth numeric,
  current_price_usd numeric,
  total_count bigint
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH counted AS (
    SELECT COUNT(*) as total
    FROM token_locks tl
    WHERE LOWER(tl.token_address) = LOWER(token_addr)
  )
  SELECT
    tl.id,
    tl.lock_id,
    tl.user_address,
    tl.token_address,
    tl.token_symbol,
    tl.token_name,
    tl.token_decimals,
    tl.amount_locked::text,
    tl.lock_duration_days,
    tl.lock_timestamp,
    tl.unlock_timestamp,
    tl.is_withdrawn,
    tl.tx_hash,
    tl.withdraw_tx_hash,
    tl.chain_id,
    COALESCE(
      (tl.amount_locked::numeric / (10::numeric ^ tl.token_decimals)) *
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)),
      0
    )::numeric as value_eth,
    COALESCE(
      (tl.amount_locked::numeric / (10::numeric ^ tl.token_decimals)) *
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    )::numeric as value_usd,
    COALESCE(
      t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0),
      0
    )::numeric as current_price_eth,
    COALESCE(
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    )::numeric as current_price_usd,
    counted.total::bigint as total_count
  FROM token_locks tl
  LEFT JOIN tokens t ON t.token_address = tl.token_address AND t.chain_id = tl.chain_id
  CROSS JOIN counted
  WHERE LOWER(tl.token_address) = LOWER(token_addr)
  ORDER BY tl.lock_timestamp DESC
  LIMIT page_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;

-- Fix get_token_lock_stats to join on chain_id
CREATE OR REPLACE FUNCTION get_token_lock_stats(token_addr text)
RETURNS TABLE (
  token_address text,
  token_symbol text,
  token_name text,
  token_decimals integer,
  total_locks_count bigint,
  active_locks_count bigint,
  unlockable_locks_count bigint,
  withdrawn_locks_count bigint,
  total_amount_locked text,
  non_withdrawn_amount_locked text,
  active_amount_locked text,
  current_price_eth numeric,
  current_price_usd numeric,
  total_value_usd numeric,
  active_value_usd numeric,
  unlockable_value_usd numeric,
  is_mcfun_token boolean
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tl.token_address,
    tl.token_symbol,
    tl.token_name,
    tl.token_decimals,
    COUNT(*)::bigint as total_locks_count,
    COUNT(*) FILTER (WHERE tl.is_withdrawn = false AND tl.unlock_timestamp > NOW())::bigint as active_locks_count,
    COUNT(*) FILTER (WHERE tl.is_withdrawn = false AND tl.unlock_timestamp <= NOW())::bigint as unlockable_locks_count,
    COUNT(*) FILTER (WHERE tl.is_withdrawn = true)::bigint as withdrawn_locks_count,
    SUM(tl.amount_locked)::text as total_amount_locked,
    SUM(CASE WHEN tl.is_withdrawn = false AND tl.unlock_timestamp > NOW() THEN tl.amount_locked ELSE 0 END)::text as non_withdrawn_amount_locked,
    SUM(CASE WHEN tl.is_withdrawn = false AND tl.unlock_timestamp > NOW() THEN tl.amount_locked ELSE 0 END)::text as active_amount_locked,
    COALESCE(
      t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0),
      0
    )::numeric as current_price_eth,
    COALESCE(
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    )::numeric as current_price_usd,
    COALESCE(
      (SUM(CASE WHEN tl.is_withdrawn = false AND tl.unlock_timestamp > NOW() THEN tl.amount_locked ELSE 0 END)::numeric / (10::numeric ^ tl.token_decimals)) *
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    )::numeric as total_value_usd,
    COALESCE(
      (SUM(CASE WHEN tl.is_withdrawn = false AND tl.unlock_timestamp > NOW() THEN tl.amount_locked ELSE 0 END)::numeric / (10::numeric ^ tl.token_decimals)) *
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    )::numeric as active_value_usd,
    COALESCE(
      (SUM(CASE WHEN tl.is_withdrawn = false AND tl.unlock_timestamp <= NOW() THEN tl.amount_locked ELSE 0 END)::numeric / (10::numeric ^ tl.token_decimals)) *
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    )::numeric as unlockable_value_usd,
    (t.token_address IS NOT NULL) as is_mcfun_token
  FROM token_locks tl
  LEFT JOIN tokens t ON t.token_address = tl.token_address AND t.chain_id = tl.chain_id
  WHERE LOWER(tl.token_address) = LOWER(token_addr)
  GROUP BY
    tl.token_address,
    tl.token_symbol,
    tl.token_name,
    tl.token_decimals,
    t.token_address,
    t.current_eth_reserve,
    t.current_token_reserve;
END;
$$ LANGUAGE plpgsql;

-- Remove legacy cron jobs that call lock-event-indexer without chain_id
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('index-lock-events-catchup', 'index-lock-events-optimized');

-- Reset the MBD lock on Base that was incorrectly marked as withdrawn
-- The sync-lock-withdrawals function was checking it against Ethereum's locker contract
-- instead of Base's locker contract, causing a false positive withdrawal status
UPDATE token_locks
SET is_withdrawn = false,
    withdraw_tx_hash = NULL
WHERE lock_id = 0 AND chain_id = 8453 AND withdraw_tx_hash = 'synced_from_chain';
