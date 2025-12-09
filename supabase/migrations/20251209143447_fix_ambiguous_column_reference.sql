/*
  # Fix Ambiguous Column Reference in Chart Function
  
  ## Summary
  Fixes the "column reference is_interpolated is ambiguous" error by properly
  qualifying all column references in the get_price_chart_data function.
  
  ## Changes
  - Added explicit table alias prefixes to all column references
  - Fixed the is_interpolated column reference to use ps.is_interpolated
  
  ## Security
    - Read-only function uses existing RLS policies
    - No new permissions needed
*/

-- Fix the get_price_chart_data function with proper column qualifications
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
  FROM price_snapshots ps
  WHERE ps.token_address = p_token_address
    AND ps.created_at >= v_start_time
    AND (NOT v_filter_interpolated OR ps.is_interpolated = false);
  
  -- If we have too many points, we need to sample
  IF v_point_count > p_max_points THEN
    -- Use time-based sampling with window functions
    RETURN QUERY
    WITH numbered_snapshots AS (
      SELECT 
        EXTRACT(EPOCH FROM ps.created_at)::bigint as snap_time_seconds,
        (ps.price_eth * ps.eth_price_usd) as snap_price_usd,
        ps.price_eth as snap_price_eth,
        0 as snap_volume_eth,
        ps.is_interpolated as snap_is_interpolated,
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
      ns.snap_time_seconds,
      ns.snap_price_usd,
      ns.snap_price_eth,
      ns.snap_volume_eth,
      ns.snap_is_interpolated
    FROM numbered_snapshots ns
    WHERE ns.rn = 1
    ORDER BY ns.snap_time_seconds ASC;
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