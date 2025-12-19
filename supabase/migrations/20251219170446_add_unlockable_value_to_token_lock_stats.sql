/*
  # Add Unlockable Value to Token Lock Stats

  1. Changes
    - Update `get_token_lock_stats` function to include `unlockable_value_usd` field
    - Calculates the USD value of tokens that are unlockable (ready to withdraw but not yet withdrawn)
    - Helps distinguish between active locks (still locked), unlockable locks (ready to withdraw), and withdrawn locks

  2. Purpose
    - Provide more granular statistics for token lock pages
    - Show the value of tokens that users can unlock right now
    - Improve transparency and visibility of lock status
*/

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
