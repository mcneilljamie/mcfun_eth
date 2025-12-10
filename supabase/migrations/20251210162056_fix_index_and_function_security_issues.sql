/*
  # Fix Index and Function Security Issues

  1. Drop Unused Indexes
    - Remove indexes that are not being used by queries
    - Includes indexes on tokens, price_snapshots, and eth_price_history tables

  2. Drop Duplicate Indexes
    - platform_stats: Keep idx_platform_stats_created_at, drop idx_platform_stats_created
    - price_snapshots: Keep idx_price_snapshots_created_at, drop idx_price_created
    - price_snapshots: Keep idx_price_snapshots_token_time, drop idx_price_snapshots_token_created
    - tokens: Keep idx_tokens_created_at, drop idx_tokens_created

  3. Fix Function Search Path Security
    - Set immutable search_path for all functions to prevent privilege escalation
    - Prevents attacks where malicious users manipulate the search_path

  Security Notes:
    - Mutable search_path in functions is a security vulnerability
    - Can lead to privilege escalation if malicious schemas are added
    - Fixed by setting explicit search_path in function definitions
*/

-- ============================================================================
-- Drop Unused Indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_tokens_amm_address;
DROP INDEX IF EXISTS idx_tokens_volume_created;
DROP INDEX IF EXISTS idx_tokens_eth_reserve;
DROP INDEX IF EXISTS idx_price_snapshots_token_time_interpolated;
DROP INDEX IF EXISTS idx_price_snapshots_interpolated_time;
DROP INDEX IF EXISTS idx_eth_price_history_created_at;

-- ============================================================================
-- Drop Duplicate Indexes (keeping the more descriptive ones)
-- ============================================================================

-- platform_stats: Keep idx_platform_stats_created_at
DROP INDEX IF EXISTS idx_platform_stats_created;

-- price_snapshots: Keep idx_price_snapshots_created_at
DROP INDEX IF EXISTS idx_price_created;

-- price_snapshots: Keep idx_price_snapshots_token_time
DROP INDEX IF EXISTS idx_price_snapshots_token_created;

-- tokens: Keep idx_tokens_created_at
DROP INDEX IF EXISTS idx_tokens_created;

-- ============================================================================
-- Fix Function Search Path Security
-- ============================================================================

-- Fix calculate_token_holders function
CREATE OR REPLACE FUNCTION calculate_token_holders(p_token_address TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  holder_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT COALESCE(buyer, seller))
  INTO holder_count
  FROM swaps
  WHERE token_address = p_token_address;
  
  RETURN COALESCE(holder_count, 0);
END;
$$;

-- Fix refresh_holder_counts function
CREATE OR REPLACE FUNCTION refresh_holder_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tokens
  SET holder_count = calculate_token_holders(token_address)
  WHERE token_address IS NOT NULL;
END;
$$;

-- Fix refresh_token_holder_count function
CREATE OR REPLACE FUNCTION refresh_token_holder_count(p_token_address TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tokens
  SET holder_count = calculate_token_holders(p_token_address)
  WHERE token_address = p_token_address;
END;
$$;

-- Fix update_platform_stats function
CREATE OR REPLACE FUNCTION update_platform_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_tokens_count INTEGER;
  total_volume_sum NUMERIC;
  total_liquidity_sum NUMERIC;
  total_trades_count BIGINT;
BEGIN
  SELECT 
    COUNT(*),
    COALESCE(SUM(volume_usd), 0),
    COALESCE(SUM(eth_reserve * 2), 0),
    COALESCE(SUM(trade_count), 0)
  INTO 
    total_tokens_count,
    total_volume_sum,
    total_liquidity_sum,
    total_trades_count
  FROM tokens;

  INSERT INTO platform_stats (
    total_tokens,
    total_volume_usd,
    total_liquidity_usd,
    total_trades
  )
  VALUES (
    total_tokens_count,
    total_volume_sum,
    total_liquidity_sum,
    total_trades_count
  );
END;
$$;

-- Fix snapshot_all_tokens_15s function
CREATE OR REPLACE FUNCTION snapshot_all_tokens_15s()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_eth_price NUMERIC;
  token_record RECORD;
BEGIN
  SELECT price_usd INTO current_eth_price
  FROM eth_price_history
  ORDER BY created_at DESC
  LIMIT 1;

  IF current_eth_price IS NULL THEN
    current_eth_price := 3000;
  END IF;

  FOR token_record IN 
    SELECT 
      token_address,
      token_reserve,
      eth_reserve
    FROM tokens
    WHERE created_at >= NOW() - INTERVAL '7 days'
      AND eth_reserve > 0
      AND token_reserve > 0
  LOOP
    INSERT INTO price_snapshots (
      token_address,
      price_eth,
      eth_price_usd,
      is_interpolated
    )
    VALUES (
      token_record.token_address,
      token_record.eth_reserve / token_record.token_reserve,
      current_eth_price,
      false
    );
  END LOOP;
END;
$$;

-- Fix track_eth_price function
CREATE OR REPLACE FUNCTION track_eth_price()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_price NUMERIC;
BEGIN
  SELECT price_usd INTO latest_price
  FROM eth_price_history
  ORDER BY created_at DESC
  LIMIT 1;

  IF latest_price IS NOT NULL THEN
    INSERT INTO eth_price_history (price_usd)
    VALUES (latest_price);
  END IF;
END;
$$;

-- Fix get_price_chart_data function
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