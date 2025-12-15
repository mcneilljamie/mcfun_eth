/*
  # Add Launch Price as First Chart Data Point

  1. Changes
    - Inject the actual launch price at token creation timestamp as first chart point
    - Ensures chart always starts from the true launch price, not first snapshot
  
  2. Purpose
    - Fix chart display to show actual launch moment
    - First snapshot might be taken after trades have occurred
    - This ensures users see the true starting price on the chart
*/

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
  launch_price_usd NUMERIC,
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
  v_launch_price_eth NUMERIC;
  v_total_rows INTEGER;
  v_sample_rate INTEGER;
BEGIN
  v_cutoff_time := NOW() - (p_hours_back || ' hours')::INTERVAL;
  v_24h_ago := NOW() - INTERVAL '24 hours';
  
  -- Get token creation time and launch price
  SELECT t.created_at, t.launch_price_eth INTO v_token_created, v_launch_price_eth
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
  current_eth_price AS (
    SELECT eth_price_usd as current_eth_usd
    FROM price_snapshots
    WHERE token_address = p_token_address
    ORDER BY created_at DESC
    LIMIT 1
  ),
  price_24h AS (
    SELECT (ps24.price_eth * ps24.eth_price_usd) as price_usd_24h
    FROM price_snapshots ps24
    WHERE ps24.token_address = p_token_address
      AND ps24.created_at >= v_24h_ago
    ORDER BY ps24.created_at
    LIMIT 1
  ),
  last_price AS (
    SELECT MAX(s.snap_price_eth * s.snap_eth_usd) FILTER (WHERE s.rn = (SELECT MAX(s2.rn) FROM sampled s2)) as last_usd
    FROM sampled s
  ),
  launch_point AS (
    -- Inject the actual launch price as the first data point at token creation time
    SELECT
      v_token_created as snap_time,
      v_launch_price_eth as snap_price_eth,
      cep.current_eth_usd as snap_eth_usd,
      true as snap_interpolated,
      0 as rn
    FROM current_eth_price cep
    WHERE v_token_created >= v_cutoff_time
  ),
  all_points AS (
    SELECT * FROM launch_point
    UNION ALL
    SELECT * FROM sampled
  )
  SELECT 
    EXTRACT(EPOCH FROM ap.snap_time)::BIGINT,
    ap.snap_price_eth,
    (ap.snap_price_eth * ap.snap_eth_usd),
    ap.snap_interpolated,
    v_token_created,
    COALESCE(v_launch_price_eth * cep.current_eth_usd, 0),
    COALESCE(lp.last_usd, 0),
    COALESCE(p24.price_usd_24h, 0)
  FROM all_points ap
  CROSS JOIN last_price lp
  CROSS JOIN current_eth_price cep
  LEFT JOIN price_24h p24 ON true
  ORDER BY ap.snap_time;
END;
$$;
