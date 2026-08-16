-- Update the chart function to look up real ETH prices from eth_price_history
-- at query time, instead of trusting the snapshot's stored eth_price_usd.
-- This ensures correct USD prices even if a snapshot was stored with a wrong ETH price.

CREATE OR REPLACE FUNCTION public.get_price_chart_data_optimized(
  p_token_address text,
  p_hours_back integer DEFAULT 168,
  p_max_points integer DEFAULT 500
)
RETURNS TABLE(
  time_seconds bigint,
  price_eth numeric,
  price_usd numeric,
  is_interpolated boolean,
  token_created_at timestamp with time zone,
  launch_price_usd numeric,
  last_price_usd numeric,
  price_24h_ago_usd numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff_time TIMESTAMPTZ;
  v_24h_ago TIMESTAMPTZ;
  v_token_created TIMESTAMPTZ;
  v_launch_price_eth NUMERIC;
  v_launch_eth_price_usd NUMERIC;
  v_current_eth_reserve NUMERIC;
  v_current_token_reserve NUMERIC;
  v_current_eth_price_usd NUMERIC;
  v_live_price_eth NUMERIC;
  v_live_price_usd NUMERIC;
  v_launch_eth_from_history NUMERIC;
BEGIN
  IF p_hours_back IS NULL OR p_hours_back = 0 THEN
    v_cutoff_time := '1970-01-01'::TIMESTAMPTZ;
  ELSE
    v_cutoff_time := NOW() - (p_hours_back || ' hours')::INTERVAL;
  END IF;
  v_24h_ago := NOW() - INTERVAL '24 hours';

  SELECT t.created_at, t.launch_price_eth, t.launch_eth_price_usd,
         t.current_eth_reserve, t.current_token_reserve
  INTO v_token_created, v_launch_price_eth, v_launch_eth_price_usd,
       v_current_eth_reserve, v_current_token_reserve
  FROM tokens t
  WHERE t.token_address = p_token_address;

  SELECT eph.price_usd INTO v_current_eth_price_usd
  FROM eth_price_history eph
  ORDER BY eph.timestamp DESC
  LIMIT 1;

  v_live_price_eth := v_current_eth_reserve / NULLIF(v_current_token_reserve, 0);
  v_live_price_usd := v_live_price_eth * COALESCE(v_current_eth_price_usd, 0);

  -- Look up the real ETH price at token launch time from history
  SELECT eph.price_usd INTO v_launch_eth_from_history
  FROM eth_price_history eph
  WHERE eph.timestamp <= v_token_created
  ORDER BY eph.timestamp DESC
  LIMIT 1;

  RETURN QUERY
  WITH all_snapshots AS (
    SELECT
      ps.created_at as snap_time,
      ps.price_eth as snap_price_eth,
      -- Look up the real ETH price from history at the snapshot's timestamp
      COALESCE(
        (SELECT eph.price_usd
         FROM eth_price_history eph
         WHERE eph.timestamp <= ps.created_at
         ORDER BY eph.timestamp DESC
         LIMIT 1),
        ps.eth_price_usd
      ) as snap_eth_usd,
      ps.is_interpolated as snap_interpolated
    FROM price_snapshots ps
    WHERE ps.token_address = p_token_address
      AND ps.created_at >= v_cutoff_time
    ORDER BY ps.created_at
  ),
  price_24h AS (
    SELECT (ps24.price_eth * COALESCE(
      (SELECT eph.price_usd FROM eth_price_history eph
       WHERE eph.timestamp <= ps24.created_at ORDER BY eph.timestamp DESC LIMIT 1),
      ps24.eth_price_usd
    )) as price_usd_24h
    FROM price_snapshots ps24
    WHERE ps24.token_address = p_token_address
      AND ps24.created_at <= v_24h_ago
    ORDER BY ps24.created_at DESC
    LIMIT 1
  ),
  oldest_price AS (
    SELECT (pso.price_eth * COALESCE(
      (SELECT eph.price_usd FROM eth_price_history eph
       WHERE eph.timestamp <= pso.created_at ORDER BY eph.timestamp DESC LIMIT 1),
      pso.eth_price_usd
    )) as price_usd_oldest
    FROM price_snapshots pso
    WHERE pso.token_address = p_token_address
    ORDER BY pso.created_at ASC
    LIMIT 1
  ),
  launch_point AS (
    SELECT
      v_token_created as snap_time,
      v_launch_price_eth as snap_price_eth,
      COALESCE(v_launch_eth_from_history, v_launch_eth_price_usd, v_current_eth_price_usd) as snap_eth_usd,
      true as snap_interpolated
    WHERE v_token_created >= v_cutoff_time
      AND v_launch_price_eth IS NOT NULL
  ),
  all_points AS (
    SELECT snap_time, snap_price_eth, snap_eth_usd, snap_interpolated FROM launch_point
    UNION ALL
    SELECT snap_time, snap_price_eth, snap_eth_usd, snap_interpolated FROM all_snapshots
  ),
  final_24h_price AS (
    SELECT COALESCE(
      p24.price_usd_24h,
      op.price_usd_oldest,
      v_launch_price_eth * COALESCE(v_launch_eth_from_history, v_launch_eth_price_usd, v_current_eth_price_usd)
    ) as final_price_24h
    FROM price_24h p24
    FULL OUTER JOIN oldest_price op ON true
  )
  SELECT
    EXTRACT(EPOCH FROM ap.snap_time)::BIGINT,
    ap.snap_price_eth,
    ap.snap_price_eth * ap.snap_eth_usd,
    ap.snap_interpolated,
    v_token_created,
    COALESCE(v_launch_price_eth * COALESCE(v_launch_eth_from_history, v_launch_eth_price_usd, v_current_eth_price_usd), 0),
    COALESCE(v_live_price_usd, 0),
    COALESCE(fp24.final_price_24h, 0)
  FROM all_points ap
  CROSS JOIN final_24h_price fp24
  ORDER BY ap.snap_time;
END;
$function$;
