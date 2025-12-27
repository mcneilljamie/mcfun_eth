/*
  # Fix Total Quantity Locked to Exclude Unlocked Tokens

  1. Changes
    - Update `get_token_lock_stats` function to only count active locks (not unlocked) in total quantity
    - Update materialized view `lock_stats_by_token_mv` to only include active locks
    - Once a lock has reached its unlock time, even if not withdrawn, it should not count towards "total quantity locked"

  2. Purpose
    - Fix issue where unlocked (but not withdrawn) tokens were counted in total quantity
    - Provide accurate locked token amounts that reflect only truly locked tokens
    - Total quantity should only include tokens that are still time-locked

  3. Security
    - All functions maintain SECURITY DEFINER for consistent access
*/

-- Update the get_token_lock_stats function
DROP FUNCTION IF EXISTS get_token_lock_stats(text);

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
    -- Changed: non_withdrawn_amount_locked now only counts active (still locked) tokens
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
    -- Changed: total_value_usd now only reflects active (still locked) tokens
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
  LEFT JOIN tokens t ON t.token_address = tl.token_address
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

-- Update the materialized view to only include active (still locked) tokens
DROP MATERIALIZED VIEW IF EXISTS lock_stats_by_token_mv CASCADE;

CREATE MATERIALIZED VIEW lock_stats_by_token_mv AS
SELECT
  tl.token_address,
  tl.token_symbol,
  tl.token_name,
  tl.token_decimals,
  SUM(tl.amount_locked) as total_amount_locked,
  COUNT(*) as lock_count,
  COUNT(*) FILTER (WHERE tl.unlock_timestamp <= NOW()) as unlockable_count,
  COALESCE(
    t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0),
    0
  ) as current_price_eth,
  COALESCE(
    (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
    (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
    0
  ) as current_price_usd,
  COALESCE(
    (SUM(tl.amount_locked) / POWER(10, tl.token_decimals)) *
    (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)),
    0
  ) as total_value_eth,
  COALESCE(
    (SUM(tl.amount_locked) / POWER(10, tl.token_decimals)) *
    (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
    (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
    0
  ) as total_value_usd,
  (t.token_address IS NOT NULL) as is_mcfun_token,
  NOW() as last_updated
FROM token_locks tl
LEFT JOIN tokens t ON t.token_address = tl.token_address
WHERE tl.is_withdrawn = false AND tl.unlock_timestamp > NOW()
GROUP BY
  tl.token_address,
  tl.token_symbol,
  tl.token_name,
  tl.token_decimals,
  t.current_eth_reserve,
  t.current_token_reserve,
  t.token_address;

-- Recreate the unique index for CONCURRENTLY refresh support
CREATE UNIQUE INDEX IF NOT EXISTS idx_lock_stats_token_unique ON lock_stats_by_token_mv(token_address);

-- Recreate index for value-based queries
CREATE INDEX IF NOT EXISTS idx_lock_stats_value ON lock_stats_by_token_mv(total_value_usd DESC NULLS LAST);

-- Recreate function to use materialized view with pagination
CREATE OR REPLACE FUNCTION get_aggregated_locks_cached(
  page_limit integer DEFAULT 10,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  token_address text,
  token_symbol text,
  token_name text,
  token_decimals integer,
  total_amount_locked numeric,
  lock_count bigint,
  unlockable_count bigint,
  current_price_eth numeric,
  current_price_usd numeric,
  total_value_eth numeric,
  total_value_usd numeric,
  is_mcfun_token boolean,
  total_count bigint
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH counted AS (
    SELECT COUNT(*) as total FROM lock_stats_by_token_mv
  )
  SELECT
    mv.token_address,
    mv.token_symbol,
    mv.token_name,
    mv.token_decimals,
    mv.total_amount_locked,
    mv.lock_count,
    mv.unlockable_count,
    mv.current_price_eth,
    mv.current_price_usd,
    mv.total_value_eth,
    mv.total_value_usd,
    mv.is_mcfun_token,
    counted.total::bigint as total_count
  FROM lock_stats_by_token_mv mv
  CROSS JOIN counted
  ORDER BY mv.total_value_usd DESC NULLS LAST
  LIMIT page_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;