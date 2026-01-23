/*
  # Chart Only Shows Price Changes - No Flat Lines

  1. Problem
    - Chart still shows flat horizontal lines between price changes
    - This happens because we keep both the end of one flat period and start of next
    - Users find this boring and want to see only dynamic price movements
    
  2. Solution
    - Only keep points where price is DIFFERENT from the previous point
    - Keep the very last point (current price) regardless
    - Skip ALL intermediate points that have same price as previous
    
  3. Result
    - Charts show vertical jumps between different prices
    - No horizontal flat lines at all
    - Most exciting and dynamic visual representation
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
BEGIN
  v_cutoff_time := NOW() - (p_hours_back || ' hours')::INTERVAL;
  v_24h_ago := NOW() - INTERVAL '24 hours';

  SELECT t.created_at, t.launch_price_eth, t.launch_eth_price_usd
  INTO v_token_created, v_launch_price_eth, v_launch_eth_price_usd
  FROM tokens t
  WHERE t.token_address = p_token_address;

  RETURN QUERY
  WITH all_snapshots AS (
    SELECT
      ps.created_at as snap_time,
      ps.price_eth as snap_price_eth,
      ps.eth_price_usd as snap_eth_usd,
      ps.is_interpolated as snap_interpolated,
      ROW_NUMBER() OVER (ORDER BY ps.created_at) as rn,
      LAG(ps.price_eth) OVER (ORDER BY ps.created_at) as prev_price_eth,
      COUNT(*) OVER () as total_count
    FROM price_snapshots ps
    WHERE ps.token_address = p_token_address
      AND ps.created_at >= v_cutoff_time
  ),
  -- Only keep points where price actually changed from previous OR it's the last point
  filtered_points AS (
    SELECT 
      a.*
    FROM all_snapshots a
    WHERE 
      -- Last point always (current price)
      a.rn = a.total_count
      -- OR price changed from previous
      OR a.prev_price_eth IS NULL 
      OR a.snap_price_eth != a.prev_price_eth
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
      AND ps24.created_at <= v_24h_ago
    ORDER BY ps24.created_at DESC
    LIMIT 1
  ),
  oldest_price AS (
    SELECT (pso.price_eth * pso.eth_price_usd) as price_usd_oldest
    FROM price_snapshots pso
    WHERE pso.token_address = p_token_address
    ORDER BY pso.created_at ASC
    LIMIT 1
  ),
  last_price AS (
    SELECT MAX(s.snap_price_eth * s.snap_eth_usd) FILTER (WHERE s.rn = (SELECT MAX(s2.rn) FROM filtered_points s2)) as last_usd
    FROM filtered_points s
  ),
  launch_point AS (
    SELECT
      v_token_created as snap_time,
      v_launch_price_eth as snap_price_eth,
      COALESCE(v_launch_eth_price_usd, cep.current_eth_usd) as snap_eth_usd,
      true as snap_interpolated,
      0 as rn,
      NULL::NUMERIC as prev_price_eth,
      1::BIGINT as total_count
    FROM current_eth_price cep
    WHERE v_token_created >= v_cutoff_time
      AND v_launch_price_eth IS NOT NULL
  ),
  all_points AS (
    SELECT snap_time, snap_price_eth, snap_eth_usd, snap_interpolated, rn FROM launch_point
    UNION ALL
    SELECT snap_time, snap_price_eth, snap_eth_usd, snap_interpolated, rn FROM filtered_points
  ),
  final_24h_price AS (
    SELECT COALESCE(
      p24.price_usd_24h,
      op.price_usd_oldest,
      v_launch_price_eth * COALESCE(v_launch_eth_price_usd, cep.current_eth_usd)
    ) as final_price_24h
    FROM current_eth_price cep
    LEFT JOIN price_24h p24 ON true
    LEFT JOIN oldest_price op ON true
  )
  SELECT
    EXTRACT(EPOCH FROM ap.snap_time)::BIGINT,
    ap.snap_price_eth,
    (ap.snap_price_eth * ap.snap_eth_usd),
    ap.snap_interpolated,
    v_token_created,
    COALESCE(v_launch_price_eth * COALESCE(v_launch_eth_price_usd, cep.current_eth_usd), 0),
    COALESCE(lp.last_usd, 0),
    COALESCE(fp24.final_price_24h, 0)
  FROM all_points ap
  CROSS JOIN last_price lp
  CROSS JOIN current_eth_price cep
  CROSS JOIN final_24h_price fp24
  ORDER BY ap.snap_time;
END;
$$;
