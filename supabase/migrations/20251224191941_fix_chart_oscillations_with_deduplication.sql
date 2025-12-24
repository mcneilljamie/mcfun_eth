/*
  # Fix Chart Oscillations by Deduplicating Data
  
  ## Summary
  Fixes the sawtooth pattern in price charts by removing consecutive duplicate
  or near-duplicate price points that create visual artifacts.
  
  ## Changes
  1. Add deduplication logic to remove consecutive identical prices
  2. Keep only significant price changes (> 0.1% change)
  3. Always keep first and last points for accurate range
  
  ## Impact
  - Eliminates visual oscillations in charts
  - Maintains accurate price change calculations
  - Reduces chart noise from stale/duplicate data
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
  v_launch_eth_price_usd NUMERIC;
  v_total_rows INTEGER;
  v_sample_rate INTEGER;
BEGIN
  v_cutoff_time := NOW() - (p_hours_back || ' hours')::INTERVAL;
  v_24h_ago := NOW() - INTERVAL '24 hours';
  
  SELECT t.created_at, t.launch_price_eth, t.launch_eth_price_usd 
  INTO v_token_created, v_launch_price_eth, v_launch_eth_price_usd
  FROM tokens t
  WHERE t.token_address = p_token_address;
  
  SELECT COUNT(*) INTO v_total_rows
  FROM price_snapshots ps
  WHERE ps.token_address = p_token_address
    AND ps.created_at >= v_cutoff_time;
  
  IF v_total_rows <= p_max_points THEN
    v_sample_rate := 1;
  ELSE
    v_sample_rate := CEIL(v_total_rows::NUMERIC / p_max_points)::INTEGER;
  END IF;
  
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
    SELECT
      v_token_created as snap_time,
      v_launch_price_eth as snap_price_eth,
      COALESCE(v_launch_eth_price_usd, cep.current_eth_usd) as snap_eth_usd,
      true as snap_interpolated,
      0 as rn
    FROM current_eth_price cep
    WHERE v_token_created >= v_cutoff_time
  ),
  all_points_raw AS (
    SELECT * FROM launch_point
    UNION ALL
    SELECT * FROM sampled
  ),
  with_price_change AS (
    SELECT 
      *,
      LAG(snap_price_eth) OVER (ORDER BY snap_time) as prev_price_eth,
      LEAD(snap_price_eth) OVER (ORDER BY snap_time) as next_price_eth,
      ROW_NUMBER() OVER (ORDER BY snap_time) as seq
    FROM all_points_raw
  ),
  deduplicated AS (
    SELECT *
    FROM with_price_change
    WHERE 
      seq = 1
      OR seq = (SELECT MAX(seq) FROM with_price_change)
      OR prev_price_eth IS NULL
      OR next_price_eth IS NULL
      OR ABS((snap_price_eth - prev_price_eth) / NULLIF(prev_price_eth, 0)) > 0.001
  )
  SELECT 
    EXTRACT(EPOCH FROM d.snap_time)::BIGINT,
    d.snap_price_eth,
    (d.snap_price_eth * d.snap_eth_usd),
    d.snap_interpolated,
    v_token_created,
    COALESCE(v_launch_price_eth * COALESCE(v_launch_eth_price_usd, cep.current_eth_usd), 0),
    COALESCE(lp.last_usd, 0),
    COALESCE(p24.price_usd_24h, 0)
  FROM deduplicated d
  CROSS JOIN last_price lp
  CROSS JOIN current_eth_price cep
  LEFT JOIN price_24h p24 ON true
  ORDER BY d.snap_time;
END;
$$;
