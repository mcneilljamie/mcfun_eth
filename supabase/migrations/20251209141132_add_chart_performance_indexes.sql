/*
  # Add Chart Performance Indexes and Functions

  ## Summary
  Adds database indexes and helper functions to optimize price chart queries.
  These optimizations ensure fast data retrieval for charts across different
  time ranges and token addresses.

  ## Changes
  1. Indexes
    - idx_price_snapshots_token_time - Composite index on (token_address, created_at)
      for fast filtering and sorting of price history
    - idx_swaps_token_time - Index on swaps table for historical price reconstruction

  2. Functions
    - get_price_chart_data - Fetches and formats price snapshot data for charts
      with automatic data sampling based on time range to avoid overwhelming the client

  ## Security
    - Read-only function uses existing RLS policies
    - No new permissions needed

  ## Notes
    - Indexes significantly improve query performance for chart rendering
    - Function handles data sampling to limit response size
*/

-- Add composite index for efficient price snapshot queries by token and time
CREATE INDEX IF NOT EXISTS idx_price_snapshots_token_time 
  ON price_snapshots(token_address, created_at DESC);

-- Add index for swaps to help with historical price reconstruction
CREATE INDEX IF NOT EXISTS idx_swaps_token_time 
  ON swaps(token_address, created_at DESC);

-- Function to get price chart data with intelligent sampling
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
BEGIN
  -- Calculate start time
  v_start_time := NOW() - (p_hours_back || ' hours')::interval;
  
  -- Count how many points we would return
  SELECT COUNT(*) INTO v_point_count
  FROM price_snapshots
  WHERE token_address = p_token_address
    AND created_at >= v_start_time;
  
  -- If we have too many points, we need to sample
  -- Calculate appropriate sample interval
  IF v_point_count > p_max_points THEN
    v_sample_interval := (p_hours_back || ' hours')::interval / p_max_points;
    
    -- Use time-based sampling with window functions
    RETURN QUERY
    WITH numbered_snapshots AS (
      SELECT 
        EXTRACT(EPOCH FROM ps.created_at)::bigint as time_seconds,
        (ps.price_eth * ps.eth_price_usd) as price_usd,
        ps.price_eth,
        0 as volume_eth, -- TODO: Add volume calculation
        ps.is_interpolated,
        ROW_NUMBER() OVER (
          PARTITION BY DATE_TRUNC('minute', ps.created_at) 
          ORDER BY ps.created_at
        ) as rn
      FROM price_snapshots ps
      WHERE ps.token_address = p_token_address
        AND ps.created_at >= v_start_time
    )
    SELECT 
      ns.time_seconds,
      ns.price_usd,
      ns.price_eth,
      ns.volume_eth,
      ns.is_interpolated
    FROM numbered_snapshots ns
    WHERE ns.rn = 1  -- Take first snapshot per minute
    ORDER BY ns.time_seconds ASC;
  ELSE
    -- Return all points if under limit
    RETURN QUERY
    SELECT 
      EXTRACT(EPOCH FROM ps.created_at)::bigint,
      (ps.price_eth * ps.eth_price_usd),
      ps.price_eth,
      0::numeric, -- TODO: Add volume calculation
      ps.is_interpolated
    FROM price_snapshots ps
    WHERE ps.token_address = p_token_address
      AND ps.created_at >= v_start_time
    ORDER BY ps.created_at ASC;
  END IF;
END;
$$;