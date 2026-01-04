/*
  # Add Live Aggregated Locks Function

  1. New Function
    - `get_aggregated_locks_live` - Real-time aggregated lock statistics
    - Queries tables directly (not cached materialized view)
    - Always returns up-to-date data

  2. Use Cases
    - When you need instant updates without 5-minute cache delay
    - Lock page top tokens display
    - Real-time dashboards

  3. Performance
    - Slightly slower than cached version (milliseconds vs microseconds)
    - Still fast enough for UI (<100ms for typical loads)
    - Uses existing indexes for optimization
*/

-- Create function for live aggregated locks (no caching)
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
  WITH aggregated AS (
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
      (t.token_address IS NOT NULL) as is_mcfun_token
    FROM token_locks tl
    LEFT JOIN tokens t ON t.token_address = tl.token_address
    WHERE tl.is_withdrawn = false
    GROUP BY
      tl.token_address,
      tl.token_symbol,
      tl.token_name,
      tl.token_decimals,
      t.current_eth_reserve,
      t.current_token_reserve,
      t.token_address
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