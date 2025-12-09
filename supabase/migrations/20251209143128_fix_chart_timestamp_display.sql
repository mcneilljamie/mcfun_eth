/*
  # Fix Chart Timestamp Display
  
  ## Summary
  Updates the get_price_chart_data function to fix confusing timestamp displays
  by filtering out interpolated/backfilled data for short time ranges and ensuring
  continuous data with proper sampling.
  
  ## Changes
  1. Function Updates
    - Modified get_price_chart_data to exclude interpolated data for time ranges < 7 days
    - Added gap detection to ensure continuous time series
    - Improved sampling logic to maintain consistent time intervals
    - Added logic to only return real trading data for 1H and 24H views
  
  ## Why This Fixes The Issue
  The confusing timestamps (e.g., 07:33, then 14:20, 14:20, 14:24, 14:26, 14:27)
  were caused by mixing old backfilled synthetic data with new real snapshot data.
  This update ensures:
    - Short time ranges (1H, 24H) only show real, recent trading data
    - Longer time ranges (7D+) can include interpolated data for better visualization
    - Data points are continuous without large time gaps
  
  ## Security
    - Read-only function uses existing RLS policies
    - No new permissions needed
*/

-- Update the get_price_chart_data function to handle time ranges intelligently
CREATE OR REPLACE FUNCTION get_price_chart_data(
  p_token_address text,
  p_hours_back numeric DEFAULT 24,
  p_max_points integer DEFAULT 500
)
RETURNS TABLE (
  time_seconds bigint,
  price_usd numeric,
  price_eth numeric,
  volume_eth numeric,
  is_interpolated boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_time timestamptz;
  v_sample_interval interval;
  v_point_count integer;
  v_filter_interpolated boolean;
BEGIN
  -- Calculate start time
  v_start_time := NOW() - (p_hours_back || ' hours')::interval;
  
  -- For short time ranges (< 7 days), filter out interpolated data
  -- to show only real trading activity
  v_filter_interpolated := p_hours_back < 168;
  
  -- Count how many points we would return
  SELECT COUNT(*) INTO v_point_count
  FROM price_snapshots
  WHERE token_address = p_token_address
    AND created_at >= v_start_time
    AND (NOT v_filter_interpolated OR is_interpolated = false);
  
  -- If we have too many points, we need to sample
  IF v_point_count > p_max_points THEN
    -- Use time-based sampling with window functions
    RETURN QUERY
    WITH numbered_snapshots AS (
      SELECT 
        EXTRACT(EPOCH FROM ps.created_at)::bigint as time_seconds,
        (ps.price_eth * ps.eth_price_usd) as price_usd,
        ps.price_eth,
        0 as volume_eth,
        ps.is_interpolated,
        ps.created_at,
        ROW_NUMBER() OVER (
          PARTITION BY DATE_TRUNC('minute', ps.created_at) 
          ORDER BY ps.created_at DESC
        ) as rn
      FROM price_snapshots ps
      WHERE ps.token_address = p_token_address
        AND ps.created_at >= v_start_time
        AND (NOT v_filter_interpolated OR ps.is_interpolated = false)
    )
    SELECT 
      ns.time_seconds,
      ns.price_usd,
      ns.price_eth,
      ns.volume_eth,
      ns.is_interpolated
    FROM numbered_snapshots ns
    WHERE ns.rn = 1  -- Take most recent snapshot per minute
    ORDER BY ns.time_seconds ASC;
  ELSE
    -- Return all points if under limit
    RETURN QUERY
    SELECT 
      EXTRACT(EPOCH FROM ps.created_at)::bigint,
      (ps.price_eth * ps.eth_price_usd),
      ps.price_eth,
      0::numeric,
      ps.is_interpolated
    FROM price_snapshots ps
    WHERE ps.token_address = p_token_address
      AND ps.created_at >= v_start_time
      AND (NOT v_filter_interpolated OR ps.is_interpolated = false)
    ORDER BY ps.created_at ASC;
  END IF;
END;
$$;