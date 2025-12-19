/*
  # Fix Numeric Overflow in Aggregated Locks

  1. Changes
    - Update get_aggregated_locks_by_token() to return total_amount_locked as text
    - This prevents JavaScript numeric overflow when handling large token amounts
    - Token amounts with 18 decimals can exceed JavaScript's MAX_SAFE_INTEGER
    - Returning as text allows safe usage with ethers.formatUnits()

  2. Purpose
    - Fix blank lock page caused by numeric overflow errors
    - Ensure large token amounts are handled correctly in the frontend
*/

-- Drop and recreate the function with text type for total_amount_locked
DROP FUNCTION IF EXISTS get_aggregated_locks_by_token();

CREATE OR REPLACE FUNCTION get_aggregated_locks_by_token()
RETURNS TABLE (
  token_address text,
  token_symbol text,
  token_name text,
  token_decimals integer,
  total_amount_locked text,
  lock_count bigint,
  current_price_eth numeric,
  current_price_usd numeric,
  total_value_eth numeric,
  total_value_usd numeric,
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
    SUM(tl.amount_locked)::text as total_amount_locked,
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
    ) as total_value_usd,
    (t.token_address IS NOT NULL) as is_mcfun_token
  FROM token_locks tl
  LEFT JOIN tokens t ON t.token_address = tl.token_address
  WHERE tl.is_withdrawn = false
    AND tl.unlock_timestamp > NOW()
  GROUP BY
    tl.token_address,
    tl.token_symbol,
    tl.token_name,
    tl.token_decimals,
    t.token_address,
    t.current_eth_reserve,
    t.current_token_reserve
  ORDER BY 
    is_mcfun_token DESC,
    CASE 
      WHEN (t.token_address IS NOT NULL) THEN total_value_usd 
      ELSE 0 
    END DESC,
    tl.token_symbol ASC;
END;
$$ LANGUAGE plpgsql;
