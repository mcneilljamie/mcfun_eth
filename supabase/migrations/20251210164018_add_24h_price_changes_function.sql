/*
  # Add Function to Get 24h Price Changes for All Tokens

  1. Purpose
    - Efficiently calculate 24-hour price changes for multiple tokens
    - Used by Popular Tokens page to show price performance
    - Returns percentage change from 24 hours ago to current price

  2. Function Details
    - Takes optional array of token addresses (null = all tokens)
    - Compares current price to price 24h ago
    - Returns null for tokens without enough history
    - Handles edge cases (no data, division by zero)

  3. Performance
    - Uses existing indexes on price_snapshots
    - LATERAL joins for efficient per-token queries
    - Returns only necessary data
*/

CREATE OR REPLACE FUNCTION get_24h_price_changes(
  p_token_addresses TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  token_address TEXT,
  price_change_24h NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH tokens_to_check AS (
    SELECT t.token_address as addr
    FROM tokens t
    WHERE p_token_addresses IS NULL
       OR t.token_address = ANY(p_token_addresses)
  ),
  current_prices AS (
    SELECT 
      tc.addr,
      (ps.price_eth * ps.eth_price_usd) as current_price
    FROM tokens_to_check tc
    CROSS JOIN LATERAL (
      SELECT price_eth, eth_price_usd
      FROM price_snapshots
      WHERE price_snapshots.token_address = tc.addr
        AND created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC
      LIMIT 1
    ) ps
  ),
  prices_24h_ago AS (
    SELECT 
      tc.addr,
      (ps.price_eth * ps.eth_price_usd) as price_24h_ago
    FROM tokens_to_check tc
    CROSS JOIN LATERAL (
      SELECT price_eth, eth_price_usd
      FROM price_snapshots
      WHERE price_snapshots.token_address = tc.addr
        AND created_at >= NOW() - INTERVAL '25 hours'
        AND created_at <= NOW() - INTERVAL '23 hours'
      ORDER BY created_at ASC
      LIMIT 1
    ) ps
  )
  SELECT 
    cp.addr::TEXT,
    CASE 
      WHEN p24.price_24h_ago IS NULL OR p24.price_24h_ago = 0 THEN NULL
      ELSE ROUND(((cp.current_price - p24.price_24h_ago) / p24.price_24h_ago * 100)::NUMERIC, 2)
    END as price_change_24h
  FROM current_prices cp
  LEFT JOIN prices_24h_ago p24 ON cp.addr = p24.addr;
$$;