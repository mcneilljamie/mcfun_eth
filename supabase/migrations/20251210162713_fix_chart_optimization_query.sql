/*
  # Fix Chart Optimization Query

  1. Problem
    - Previous migration had incorrect DISTINCT ON bucketing logic
    - Division operation on timestamp invalid

  2. Solution
    - Use simpler modulo-based sampling
    - Keep it straightforward and fast
    - Maintain all optimizations (single query, metadata)

  3. Changes
    - Fix sampling logic
    - Use row sampling instead of complex time bucketing
*/

-- Drop and recreate with corrected logic
DROP FUNCTION IF EXISTS get_price_chart_data_optimized(text, integer, integer);
DROP FUNCTION IF EXISTS get_price_chart_data(text, integer, integer);

-- Optimized function with corrected sampling
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
  
  -- Get token creation time (cached by index)
  SELECT created_at INTO v_token_created
  FROM tokens
  WHERE token_address = p_token_address;
  
  -- Quick count to determine sampling (uses index)
  SELECT COUNT(*) INTO v_total_rows
  FROM price_snapshots
  WHERE token_address = p_token_address
    AND created_at >= v_cutoff_time;
  
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
      created_at,
      price_eth,
      eth_price_usd,
      is_interpolated,
      ROW_NUMBER() OVER (ORDER BY created_at) as rn
    FROM price_snapshots
    WHERE token_address = p_token_address
      AND created_at >= v_cutoff_time
  ),
  sampled AS (
    SELECT *
    FROM numbered_rows
    WHERE (rn - 1) % v_sample_rate = 0
  ),
  price_24h AS (
    SELECT (price_eth * eth_price_usd) as price_usd
    FROM price_snapshots
    WHERE token_address = p_token_address
      AND created_at >= v_24h_ago
    ORDER BY created_at
    LIMIT 1
  ),
  first_last AS (
    SELECT 
      MIN(price_eth * eth_price_usd) FILTER (WHERE rn = 1) as first_usd,
      MAX(price_eth * eth_price_usd) FILTER (WHERE rn = (SELECT MAX(rn) FROM sampled)) as last_usd
    FROM sampled
  )
  SELECT 
    EXTRACT(EPOCH FROM s.created_at)::BIGINT,
    s.price_eth,
    (s.price_eth * s.eth_price_usd),
    s.is_interpolated,
    v_token_created,
    COALESCE(fl.first_usd, 0),
    COALESCE(fl.last_usd, 0),
    COALESCE(p24.price_usd, 0)
  FROM sampled s
  CROSS JOIN first_last fl
  LEFT JOIN price_24h p24 ON true
  ORDER BY s.created_at;
END;
$$;

-- Backward-compatible wrapper
CREATE OR REPLACE FUNCTION get_price_chart_data(
  p_token_address TEXT,
  p_hours_back INTEGER DEFAULT 168,
  p_max_points INTEGER DEFAULT 500
)
RETURNS TABLE (
  time_seconds BIGINT,
  price_eth NUMERIC,
  price_usd NUMERIC,
  is_interpolated BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT 
    time_seconds,
    price_eth,
    price_usd,
    is_interpolated
  FROM get_price_chart_data_optimized(
    p_token_address,
    p_hours_back,
    p_max_points
  );
$$;