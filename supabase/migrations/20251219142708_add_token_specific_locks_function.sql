/*
  # Add Token-Specific Locks Function

  1. New Functions
    - `get_locks_by_token_address(token_addr text)` - Returns all locks for a specific token
      - Includes active, unlockable, and withdrawn locks
      - Calculates current USD values for each lock
      - Provides aggregated statistics for the token
      - Returns locks sorted by lock timestamp (newest first)

  2. Purpose
    - Enable token-specific lock page views
    - Show full lock history for individual tokens
    - Support filtering and analytics by token

  3. Security
    - Function is marked as SECURITY DEFINER to bypass RLS
    - Only exposes public lock data (locks are publicly viewable)
*/

-- Function to get all locks for a specific token address
CREATE OR REPLACE FUNCTION get_locks_by_token_address(token_addr text)
RETURNS TABLE (
  id uuid,
  lock_id bigint,
  user_address text,
  token_address text,
  token_symbol text,
  token_name text,
  token_decimals integer,
  amount_locked text,
  amount_locked_formatted numeric,
  lock_duration_days integer,
  lock_timestamp timestamptz,
  unlock_timestamp timestamptz,
  is_withdrawn boolean,
  is_unlockable boolean,
  current_price_eth numeric,
  current_price_usd numeric,
  value_eth numeric,
  value_usd numeric,
  tx_hash text,
  status text
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tl.id,
    tl.lock_id,
    tl.user_address,
    tl.token_address,
    tl.token_symbol,
    tl.token_name,
    tl.token_decimals,
    tl.amount_locked::text as amount_locked,
    (tl.amount_locked::numeric / (10::numeric ^ tl.token_decimals)) as amount_locked_formatted,
    tl.lock_duration_days,
    tl.lock_timestamp,
    tl.unlock_timestamp,
    tl.is_withdrawn,
    (tl.unlock_timestamp <= NOW() AND tl.is_withdrawn = false) as is_unlockable,
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
    tl.tx_hash,
    CASE
      WHEN tl.is_withdrawn THEN 'withdrawn'
      WHEN tl.unlock_timestamp <= NOW() THEN 'unlockable'
      ELSE 'active'
    END as status
  FROM token_locks tl
  LEFT JOIN tokens t ON t.token_address = tl.token_address
  WHERE LOWER(tl.token_address) = LOWER(token_addr)
  ORDER BY tl.lock_timestamp DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get aggregated statistics for a specific token
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
  active_amount_locked text,
  current_price_eth numeric,
  current_price_usd numeric,
  total_value_usd numeric,
  active_value_usd numeric,
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
      (SUM(tl.amount_locked)::numeric / (10::numeric ^ tl.token_decimals)) *
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
