/*
  # Fix Aggregated Locks to Display All Tokens with Locks

  1. Problem
    - Previous fix added HAVING clause that excluded tokens with 0 active locks
    - This caused "Top Locked Tokens" section to disappear if tokens only had unlocked (but not withdrawn) locks
    - Users should still see these tokens, just with accurate locked amounts

  2. Solution
    - Remove HAVING clause that filtered out tokens completely
    - Keep the logic that only counts actively locked tokens in amounts
    - Tokens with 0 active locks will show "0" locked but still appear in the list
    - Natural sorting by value will put them at the bottom

  3. Changes
    - Remove HAVING clause from get_aggregated_locks_live
    - All tokens with any non-withdrawn locks will appear
    - Amounts still only reflect truly locked tokens (unlock_timestamp > NOW())
*/

-- Fix the live aggregated locks function to show all tokens with locks
CREATE OR REPLACE FUNCTION get_aggregated_locks_live(
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
  WITH all_active_locks AS (
    -- Get all non-withdrawn locks
    SELECT
      tl.token_address,
      tl.token_symbol,
      tl.token_name,
      tl.token_decimals,
      tl.amount_locked,
      tl.unlock_timestamp,
      tl.is_withdrawn
    FROM token_locks tl
    WHERE tl.is_withdrawn = false
  ),
  aggregated AS (
    SELECT
      aal.token_address,
      aal.token_symbol,
      aal.token_name,
      aal.token_decimals,
      -- Only sum tokens that are still locked (not just non-withdrawn)
      SUM(CASE WHEN aal.unlock_timestamp > NOW() THEN aal.amount_locked ELSE 0 END) as total_amount_locked,
      -- Count only locks that are still locked
      COUNT(*) FILTER (WHERE aal.unlock_timestamp > NOW()) as lock_count,
      -- Count locks that are unlockable (unlocked but not withdrawn)
      COUNT(*) FILTER (WHERE aal.unlock_timestamp <= NOW()) as unlockable_count,
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
        (SUM(CASE WHEN aal.unlock_timestamp > NOW() THEN aal.amount_locked ELSE 0 END) / POWER(10, aal.token_decimals)) *
        (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)),
        0
      ) as total_value_eth,
      COALESCE(
        (SUM(CASE WHEN aal.unlock_timestamp > NOW() THEN aal.amount_locked ELSE 0 END) / POWER(10, aal.token_decimals)) *
        (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
        (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
        0
      ) as total_value_usd,
      (t.token_address IS NOT NULL) as is_mcfun_token
    FROM all_active_locks aal
    LEFT JOIN tokens t ON t.token_address = aal.token_address
    GROUP BY
      aal.token_address,
      aal.token_symbol,
      aal.token_name,
      aal.token_decimals,
      t.current_eth_reserve,
      t.current_token_reserve,
      t.token_address
    -- Removed HAVING clause - show all tokens with any non-withdrawn locks
  ),
  counted AS (
    SELECT COUNT(*) as total FROM aggregated
  )
  SELECT
    agg.token_address,
    agg.token_symbol,
    agg.token_name,
    agg.token_decimals,
    agg.total_amount_locked,
    agg.lock_count,
    agg.unlockable_count,
    agg.current_price_eth,
    agg.current_price_usd,
    agg.total_value_eth,
    agg.total_value_usd,
    agg.is_mcfun_token,
    counted.total::bigint as total_count
  FROM aggregated agg
  CROSS JOIN counted
  ORDER BY agg.total_value_usd DESC NULLS LAST
  LIMIT page_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;