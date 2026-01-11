/*
  # Fix Chart Sampling to Include All Significant Price Changes

  1. Problem
    - Current sampling takes every Nth row uniformly
    - This misses important price changes that happen between sampled rows
    - Trades and swaps create price volatility that gets lost in downsampling
    
  2. Solution
    - Use adaptive sampling that always includes rows with significant price changes
    - Add change-based filtering BEFORE uniform sampling
    - Keep all rows where price changed by >0.5% from previous row
    - Then apply uniform sampling to remaining rows for smoothness

  3. Impact
    - Charts will show all meaningful price movements
    - No more missing trades or swap activity
    - Still maintains reasonable data point count for performance
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

  -- Return all data in single query
  RETURN QUERY
  WITH all_snapshots AS (
    SELECT
      ps.created_at as snap_time,
      ps.price_eth as snap_price_eth,
      ps.eth_price_usd as snap_eth_usd,
      ps.is_interpolated as snap_interpolated,
      ROW_NUMBER() OVER (ORDER BY ps.created_at) as rn,
      LAG(ps.price_eth) OVER (ORDER BY ps.created_at) as prev_price_eth
    FROM price_snapshots ps
    WHERE ps.token_address = p_token_address
      AND ps.created_at >= v_cutoff_time
  ),
  -- Identify significant price changes (>0.5% change from previous)
  significant_changes AS (
    SELECT *
    FROM all_snapshots
    WHERE prev_price_eth IS NULL
      OR ABS((snap_price_eth - prev_price_eth) / NULLIF(prev_price_eth, 0)) > 0.005
  ),
  -- Calculate sample rate for remaining rows
  sample_config AS (
    SELECT 
      CASE 
        WHEN (SELECT COUNT(*) FROM all_snapshots) - (SELECT COUNT(*) FROM significant_changes) <= p_max_points - (SELECT COUNT(*) FROM significant_changes)
        THEN 1
        ELSE GREATEST(1, CEIL(((SELECT COUNT(*) FROM all_snapshots) - (SELECT COUNT(*) FROM significant_changes))::NUMERIC / (p_max_points - (SELECT COUNT(*) FROM significant_changes)))::INTEGER)
      END as sample_rate
  ),
  -- Sample non-significant rows uniformly
  sampled_rows AS (
    SELECT a.*
    FROM all_snapshots a
    CROSS JOIN sample_config sc
    WHERE a.rn IN (SELECT rn FROM significant_changes)
      OR (a.rn - 1) % sc.sample_rate = 0
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
    SELECT MAX(s.snap_price_eth * s.snap_eth_usd) FILTER (WHERE s.rn = (SELECT MAX(s2.rn) FROM sampled_rows s2)) as last_usd
    FROM sampled_rows s
  ),
  launch_point AS (
    SELECT
      v_token_created as snap_time,
      v_launch_price_eth as snap_price_eth,
      COALESCE(v_launch_eth_price_usd, cep.current_eth_usd) as snap_eth_usd,
      true as snap_interpolated,
      0 as rn,
      NULL::NUMERIC as prev_price_eth
    FROM current_eth_price cep
    WHERE v_token_created >= v_cutoff_time
  ),
  all_points AS (
    SELECT * FROM launch_point
    UNION ALL
    SELECT * FROM sampled_rows
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
