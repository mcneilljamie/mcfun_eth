/*
  # Add Get All Locks With Values Function

  1. New Function
    - `get_all_locks_with_values()` - Returns all locks with calculated USD/ETH values
      - Includes price and value data from tokens table (for McFun tokens)
      - Returns 0 for non-McFun tokens (no price data available)
      - Sorted by creation date (newest first)

  2. Purpose
    - Provide consistent value data for all lock displays
    - Support "Your Active Locks" section with USD values
    - Enable proper value calculations in portfolio

  3. Security
    - Function is marked as SECURITY DEFINER to bypass RLS
    - Only exposes public lock data (locks are publicly viewable)
*/

CREATE OR REPLACE FUNCTION get_all_locks_with_values()
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
  value_eth numeric,
  value_usd numeric,
  current_price_eth numeric,
  current_price_usd numeric
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
    tl.amount_locked::text,
    tl.lock_duration_days,
    tl.lock_timestamp,
    tl.unlock_timestamp,
    tl.is_withdrawn,
    tl.tx_hash,
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
    )::numeric as current_price_usd
  FROM token_locks tl
  LEFT JOIN tokens t ON t.token_address = tl.token_address
  ORDER BY tl.created_at DESC;
END;
$$ LANGUAGE plpgsql;
