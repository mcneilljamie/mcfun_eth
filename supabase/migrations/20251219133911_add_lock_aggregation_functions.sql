/*
  # Add Lock Aggregation Functions

  1. New Functions
    - `get_aggregated_locks_by_token()` - Returns total value locked (TVL) for each token
      - Aggregates all locks by token address
      - Calculates total amount locked
      - Includes token details and count of locks
      - Returns data sorted by total USD value (highest to lowest)

    - `get_user_locked_tokens(user_addr text)` - Returns a user's locked tokens with current values
      - Shows all active locks for a specific user
      - Calculates current USD value based on token prices
      - Includes unlock status and time remaining

  2. Purpose
    - Enable efficient querying of aggregated lock data
    - Support portfolio page locked tokens display
    - Support lock page ranking by total value
    - Provide real-time USD valuations

  3. Security
    - Functions are marked as SECURITY DEFINER to bypass RLS
    - But they only expose public data (locks are publicly viewable)
*/

-- Function to get aggregated locks by token with total values
CREATE OR REPLACE FUNCTION get_aggregated_locks_by_token()
RETURNS TABLE (
  token_address text,
  token_symbol text,
  token_name text,
  token_decimals integer,
  total_amount_locked numeric,
  lock_count bigint,
  current_price_eth numeric,
  current_price_usd numeric,
  total_value_eth numeric,
  total_value_usd numeric
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
    SUM(tl.amount_locked) as total_amount_locked,
    COUNT(*)::bigint as lock_count,
    COALESCE(
      t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0),
      0
    ) as current_price_eth,
    COALESCE(
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT eth_price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
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
      (SELECT eth_price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    ) as total_value_usd
  FROM token_locks tl
  LEFT JOIN tokens t ON t.token_address = tl.token_address
  WHERE tl.is_withdrawn = false
    AND tl.unlock_timestamp > NOW()
  GROUP BY
    tl.token_address,
    tl.token_symbol,
    tl.token_name,
    tl.token_decimals,
    t.current_eth_reserve,
    t.current_token_reserve
  ORDER BY total_value_usd DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's locked tokens with current values
CREATE OR REPLACE FUNCTION get_user_locked_tokens(user_addr text)
RETURNS TABLE (
  id uuid,
  lock_id bigint,
  token_address text,
  token_symbol text,
  token_name text,
  token_decimals integer,
  amount_locked numeric,
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
  tx_hash text
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tl.id,
    tl.lock_id,
    tl.token_address,
    tl.token_symbol,
    tl.token_name,
    tl.token_decimals,
    tl.amount_locked,
    (tl.amount_locked / POWER(10, tl.token_decimals)) as amount_locked_formatted,
    tl.lock_duration_days,
    tl.lock_timestamp,
    tl.unlock_timestamp,
    tl.is_withdrawn,
    (tl.unlock_timestamp <= NOW() AND tl.is_withdrawn = false) as is_unlockable,
    COALESCE(
      t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0),
      0
    ) as current_price_eth,
    COALESCE(
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT eth_price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    ) as current_price_usd,
    COALESCE(
      (tl.amount_locked / POWER(10, tl.token_decimals)) *
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)),
      0
    ) as value_eth,
    COALESCE(
      (tl.amount_locked / POWER(10, tl.token_decimals)) *
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT eth_price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    ) as value_usd,
    tl.tx_hash
  FROM token_locks tl
  LEFT JOIN tokens t ON t.token_address = tl.token_address
  WHERE LOWER(tl.user_address) = LOWER(user_addr)
  ORDER BY tl.created_at DESC;
END;
$$ LANGUAGE plpgsql;