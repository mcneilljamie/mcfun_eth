/*
  # Add Automatic Price Snapshot Cleanup

  ## Summary
  Implements automatic cleanup of old price snapshots to prevent unbounded database growth.
  Keeps 90 days of snapshot history which is sufficient for analysis while keeping the
  database size manageable.

  ## Changes
  1. Create cleanup function
     - Deletes price_snapshots older than 90 days
     - Keeps launch price points (first snapshot per token)
     - Logs cleanup statistics

  2. Schedule automatic cleanup
     - Runs daily at 3 AM UTC via pg_cron
     - Low-impact time to avoid peak usage

  ## Performance Impact
  - Prevents table from growing beyond ~13M rows (100 tokens × 90 days × 1440 snapshots/day)
  - Maintains query performance on price_snapshots table
  - Reduces backup/restore times significantly

  ## Data Retention
  - 90 days: Full minute-by-minute history
  - Beyond 90 days: Only launch price point retained per token
*/

-- Create function to clean up old price snapshots
CREATE OR REPLACE FUNCTION cleanup_old_price_snapshots()
RETURNS TABLE (
  deleted_count BIGINT,
  oldest_remaining TIMESTAMPTZ,
  execution_time_ms INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_cutoff_date TIMESTAMPTZ;
  v_deleted_count BIGINT;
  v_oldest_remaining TIMESTAMPTZ;
BEGIN
  v_start_time := clock_timestamp();
  v_cutoff_date := NOW() - INTERVAL '90 days';

  -- Delete old snapshots but keep the first snapshot for each token (launch price)
  WITH first_snapshots AS (
    SELECT DISTINCT ON (token_address) id
    FROM price_snapshots
    ORDER BY token_address, created_at ASC
  )
  DELETE FROM price_snapshots
  WHERE created_at < v_cutoff_date
    AND id NOT IN (SELECT id FROM first_snapshots);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Get oldest remaining snapshot
  SELECT MIN(created_at) INTO v_oldest_remaining
  FROM price_snapshots;

  v_end_time := clock_timestamp();

  RETURN QUERY SELECT
    v_deleted_count,
    v_oldest_remaining,
    EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INTEGER;
END;
$$;

-- Create similar cleanup for platform_stats (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_platform_stats()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff_date TIMESTAMPTZ;
  v_deleted_count BIGINT;
BEGIN
  v_cutoff_date := NOW() - INTERVAL '90 days';

  DELETE FROM platform_stats
  WHERE created_at < v_cutoff_date;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$;

-- Create similar cleanup for eth_price_history (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_eth_price_history()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff_date TIMESTAMPTZ;
  v_deleted_count BIGINT;
BEGIN
  v_cutoff_date := NOW() - INTERVAL '90 days';

  DELETE FROM eth_price_history
  WHERE timestamp < v_cutoff_date;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$;

-- Schedule daily cleanup at 3 AM UTC
SELECT cron.schedule(
  'cleanup-old-price-snapshots',
  '0 3 * * *',
  $$SELECT cleanup_old_price_snapshots();$$
);

SELECT cron.schedule(
  'cleanup-old-platform-stats',
  '5 3 * * *',
  $$SELECT cleanup_old_platform_stats();$$
);

SELECT cron.schedule(
  'cleanup-old-eth-price-history',
  '10 3 * * *',
  $$SELECT cleanup_old_eth_price_history();$$
);
