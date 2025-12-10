/*
  # Optimize Chart Loading Performance

  1. Problem
    - Chart loading makes 4-5 separate database queries
    - ROW_NUMBER() over entire dataset is expensive
    - Separate queries for price change calculation
    - No query result caching

  2. Solution
    - Create single optimized function that returns all needed data
    - Use time-based bucketing instead of ROW_NUMBER for sampling
    - Include metadata (token age, price changes) in single query
    - Leverage existing composite indexes

  3. Changes
    - Replace get_price_chart_data with optimized version
    - Use DISTINCT ON for efficient sampling
    - Return additional metadata to eliminate separate queries
    - Add query result stability for better caching

  4. Performance Impact
    - Reduces 4-5 queries to 1 query
    - Eliminates expensive ROW_NUMBER window function
    - Uses index-only scans where possible
    - Expected 3-5x faster chart loading
*/

-- Drop old function
DROP FUNCTION IF EXISTS get_price_chart_data(text, integer, integer);

-- Create optimized function that returns chart data and metadata in one query
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
STABLE -- Mark as STABLE for better query planning
AS $$
DECLARE
  v_cutoff_time TIMESTAMPTZ;
  v_24h_ago TIMESTAMPTZ;
  v_bucket_size INTERVAL;
  v_token_created TIMESTAMPTZ;
BEGIN
  v_cutoff_time := NOW() - (p_hours_back || ' hours')::INTERVAL;
  v_24h_ago := NOW() - INTERVAL '24 hours';
  
  -- Get token creation time
  SELECT created_at INTO v_token_created
  FROM tokens
  WHERE token_address = p_token_address
  LIMIT 1;
  
  -- Calculate bucket size for sampling
  -- Aim for roughly p_max_points by bucketing time intervals
  v_bucket_size := (p_hours_back || ' hours')::INTERVAL / p_max_points;
  
  -- Return sampled data with metadata
  RETURN QUERY
  WITH sampled_data AS (
    SELECT DISTINCT ON (DATE_TRUNC('second', created_at / v_bucket_size) * v_bucket_size)
      created_at,
      price_eth,
      eth_price_usd,
      is_interpolated
    FROM price_snapshots
    WHERE token_address = p_token_address
      AND created_at >= v_cutoff_time
    ORDER BY 
      DATE_TRUNC('second', created_at / v_bucket_size) * v_bucket_size,
      created_at DESC
  ),
  price_points AS (
    SELECT
      EXTRACT(EPOCH FROM sd.created_at)::BIGINT as ts,
      sd.price_eth,
      (sd.price_eth * sd.eth_price_usd) as price_usd,
      sd.is_interpolated
    FROM sampled_data sd
    ORDER BY sd.created_at
  ),
  first_price AS (
    SELECT price_usd as first_usd
    FROM price_points
    ORDER BY ts
    LIMIT 1
  ),
  last_price AS (
    SELECT price_usd as last_usd
    FROM price_points
    ORDER BY ts DESC
    LIMIT 1
  ),
  price_24h AS (
    SELECT (price_eth * eth_price_usd) as price_24h_usd
    FROM price_snapshots
    WHERE token_address = p_token_address
      AND created_at >= v_24h_ago
    ORDER BY created_at
    LIMIT 1
  )
  SELECT 
    pp.ts,
    pp.price_eth,
    pp.price_usd,
    pp.is_interpolated,
    v_token_created,
    COALESCE(fp.first_usd, 0),
    COALESCE(lp.last_usd, 0),
    COALESCE(p24.price_24h_usd, 0)
  FROM price_points pp
  CROSS JOIN LATERAL (SELECT first_usd FROM first_price) fp
  CROSS JOIN LATERAL (SELECT last_usd FROM last_price) lp
  CROSS JOIN LATERAL (SELECT COALESCE(price_24h_usd, 0) as price_24h_usd FROM price_24h) p24;
END;
$$;

-- Create backward-compatible alias
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