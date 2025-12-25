/*
  # Add Lock Statistics Materialized View

  1. New Materialized Views
    - `lock_stats_by_token_mv` - Pre-computed aggregated statistics per token
    - Refreshed every 5 minutes via cron job
    - Significantly faster queries for lock statistics

  2. Performance Impact
    - Reduces query time from seconds to milliseconds
    - Pre-calculates expensive joins and aggregations
    - Scales well to 10,000+ locks

  3. Indexes
    - Index on total_value_usd for ranking queries
    - Index on token_address for lookups
*/

-- Drop existing materialized view if it exists
DROP MATERIALIZED VIEW IF EXISTS lock_stats_by_token_mv CASCADE;

-- Create materialized view for lock statistics
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
WHERE tl.is_withdrawn = false
GROUP BY
  tl.token_address,
  tl.token_symbol,
  tl.token_name,
  tl.token_decimals,
  t.current_eth_reserve,
  t.current_token_reserve,
  t.token_address;

-- Create unique index for CONCURRENTLY refresh support
CREATE UNIQUE INDEX idx_lock_stats_token_unique ON lock_stats_by_token_mv(token_address);

-- Create index for value-based queries
CREATE INDEX idx_lock_stats_value ON lock_stats_by_token_mv(total_value_usd DESC NULLS LAST);

-- Create function to use materialized view with pagination
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

-- Create cron job to refresh materialized view every 5 minutes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'refresh-lock-stats-mv'
  ) THEN
    PERFORM cron.schedule(
      'refresh-lock-stats-mv',
      '*/5 * * * *',
      $CRON$
      REFRESH MATERIALIZED VIEW CONCURRENTLY lock_stats_by_token_mv;
      $CRON$
    );
  END IF;
END $$;
