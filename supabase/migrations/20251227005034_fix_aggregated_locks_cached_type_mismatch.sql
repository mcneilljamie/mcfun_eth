/*
  # Fix Type Mismatch in get_aggregated_locks_cached

  1. Issue
    - Function expects numeric type but materialized view returns double precision
    - Causes function to fail when called

  2. Fix
    - Update function to match actual materialized view column types
    - Cast values to numeric where needed

  3. Security
    - Maintains SECURITY DEFINER for consistent access
*/

DROP FUNCTION IF EXISTS get_aggregated_locks_cached(integer, integer);

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
    mv.current_price_eth::numeric,
    mv.current_price_usd::numeric,
    mv.total_value_eth::numeric,
    mv.total_value_usd::numeric,
    mv.is_mcfun_token,
    counted.total::bigint as total_count
  FROM lock_stats_by_token_mv mv
  CROSS JOIN counted
  ORDER BY mv.total_value_usd DESC NULLS LAST
  LIMIT page_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;