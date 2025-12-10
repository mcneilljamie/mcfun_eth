/*
  # Fix Ambiguous Column References in Chart Function

  1. Problem
    - Column names in queries conflicting with function return table column names
    - PostgreSQL can't determine if reference is to variable or column

  2. Solution
    - Explicitly prefix all column references with table aliases
    - Use consistent naming in CTEs
    - Rename variables to avoid conflicts

  3. Changes
    - Add explicit table/CTE aliases to all column references
    - Fix ambiguous references in all CTEs
*/

-- Drop and recreate with fixed column references
DROP FUNCTION IF EXISTS get_price_chart_data_optimized(text, integer, integer);

CREATE OR REPLACE FUNCTION get_price_chart_data_optimized(
  p_token_address TEXT,
  p_hours_back INTEGER DEFAULT 168,
  p_max_points INTEGER DEFAULT 500
)
RETURNS TABLE (
  time_seconds BIGINT,
  price_eth NUMERIC,
  price_usd NUMERIC,
  is_interpolated BOOLEAN,
  token_created_at TIMESTAMPTZ,
  first_price_usd NUMERIC,
  last_price_usd NUMERIC,
  price_24h_ago_usd NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_cutoff_time TIMESTAMPTZ;
  v_24h_ago TIMESTAMPTZ;
  v_token_created TIMESTAMPTZ;
  v_total_rows INTEGER;
  v_sample_rate INTEGER;
BEGIN
  v_cutoff_time := NOW() - (p_hours_back || ' hours')::INTERVAL;
  v_24h_ago := NOW() - INTERVAL '24 hours';
  
  -- Get token creation time
  SELECT t.created_at INTO v_token_created
  FROM tokens t
  WHERE t.token_address = p_token_address;
  
  -- Quick count to determine sampling
  SELECT COUNT(*) INTO v_total_rows
  FROM price_snapshots ps
  WHERE ps.token_address = p_token_address
    AND ps.created_at >= v_cutoff_time;
  
  -- Calculate sample rate
  IF v_total_rows <= p_max_points THEN
    v_sample_rate := 1;
  ELSE
    v_sample_rate := CEIL(v_total_rows::NUMERIC / p_max_points)::INTEGER;
  END IF;
  
  -- Return all data in single query
  RETURN QUERY
  WITH numbered_rows AS (
    SELECT 
      ps.created_at as snap_time,
      ps.price_eth as snap_price_eth,
      ps.eth_price_usd as snap_eth_usd,
      ps.is_interpolated as snap_interpolated,
      ROW_NUMBER() OVER (ORDER BY ps.created_at) as rn
    FROM price_snapshots ps
    WHERE ps.token_address = p_token_address
      AND ps.created_at >= v_cutoff_time
  ),
  sampled AS (
    SELECT *
    FROM numbered_rows
    WHERE (rn - 1) % v_sample_rate = 0
  ),
  price_24h AS (
    SELECT (ps24.price_eth * ps24.eth_price_usd) as price_usd_24h
    FROM price_snapshots ps24
    WHERE ps24.token_address = p_token_address
      AND ps24.created_at >= v_24h_ago
    ORDER BY ps24.created_at
    LIMIT 1
  ),
  first_last AS (
    SELECT 
      MIN(s.snap_price_eth * s.snap_eth_usd) FILTER (WHERE s.rn = 1) as first_usd,
      MAX(s.snap_price_eth * s.snap_eth_usd) FILTER (WHERE s.rn = (SELECT MAX(s2.rn) FROM sampled s2)) as last_usd
    FROM sampled s
  )
  SELECT 
    EXTRACT(EPOCH FROM s.snap_time)::BIGINT,
    s.snap_price_eth,
    (s.snap_price_eth * s.snap_eth_usd),
    s.snap_interpolated,
    v_token_created,
    COALESCE(fl.first_usd, 0),
    COALESCE(fl.last_usd, 0),
    COALESCE(p24.price_usd_24h, 0)
  FROM sampled s
  CROSS JOIN first_last fl
  LEFT JOIN price_24h p24 ON true
  ORDER BY s.snap_time;
END;
$$;