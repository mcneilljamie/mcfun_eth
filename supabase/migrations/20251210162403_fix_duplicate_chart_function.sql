/*
  # Fix Duplicate get_price_chart_data Function

  1. Problem
    - Two versions of get_price_chart_data exist with different parameter types
    - One has p_hours_back as INTEGER, another as NUMERIC
    - PostgreSQL can't resolve which function to call

  2. Solution
    - Drop all versions of the function
    - Create a single version with INTEGER parameter type
    - Ensure search_path is set for security

  3. Changes
    - DROP FUNCTION with all possible signatures
    - CREATE single canonical version with proper security settings
*/

-- Drop all versions of the function
DROP FUNCTION IF EXISTS get_price_chart_data(text, integer, integer);
DROP FUNCTION IF EXISTS get_price_chart_data(text, numeric, integer);

-- Create single canonical version with INTEGER parameter
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff_time TIMESTAMPTZ;
  total_points INTEGER;
  sample_interval INTEGER;
BEGIN
  cutoff_time := NOW() - (p_hours_back || ' hours')::INTERVAL;
  
  SELECT COUNT(*) INTO total_points
  FROM price_snapshots ps
  WHERE ps.token_address = p_token_address
    AND ps.created_at >= cutoff_time;
  
  IF total_points <= p_max_points THEN
    sample_interval := 1;
  ELSE
    sample_interval := CEIL(total_points::NUMERIC / p_max_points);
  END IF;
  
  RETURN QUERY
  WITH numbered_snapshots AS (
    SELECT 
      ps.created_at,
      ps.price_eth,
      ps.eth_price_usd,
      ps.is_interpolated,
      ROW_NUMBER() OVER (ORDER BY ps.created_at) as rn
    FROM price_snapshots ps
    WHERE ps.token_address = p_token_address
      AND ps.created_at >= cutoff_time
    ORDER BY ps.created_at
  )
  SELECT 
    EXTRACT(EPOCH FROM ns.created_at)::BIGINT as time_seconds,
    ns.price_eth,
    (ns.price_eth * ns.eth_price_usd) as price_usd,
    ns.is_interpolated
  FROM numbered_snapshots ns
  WHERE (ns.rn - 1) % sample_interval = 0
  ORDER BY ns.created_at;
END;
$$;