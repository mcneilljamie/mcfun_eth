/*
  # Fix Price Changes Function to Use Launch ETH Price
  
  1. Changes
    - Update get_24h_price_changes to use launch_eth_price_usd from tokens table
    - Calculate launch price using historical ETH price, not current
    
  2. Purpose
    - Ensures 24h price changes match what users see on the chart
    - Fixes -2% to -8% errors caused by ETH price movement
    - Makes price calculations consistent with chart data
*/

DROP FUNCTION IF EXISTS get_24h_price_changes(TEXT[]);

CREATE OR REPLACE FUNCTION get_24h_price_changes(
  p_token_addresses TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  token_address TEXT,
  price_change NUMERIC,
  is_new BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH tokens_to_check AS (
    SELECT 
      t.token_address as addr, 
      t.created_at as token_created_at, 
      t.launch_price_eth,
      t.launch_eth_price_usd
    FROM tokens t
    WHERE p_token_addresses IS NULL
       OR t.token_address = ANY(p_token_addresses)
  ),
  token_ages AS (
    SELECT 
      addr,
      token_created_at,
      launch_price_eth,
      launch_eth_price_usd,
      (NOW() - token_created_at) < INTERVAL '24 hours' as is_new_token
    FROM tokens_to_check
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
        AND created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at ASC
      LIMIT 1
    ) ps
  )
  SELECT 
    cp.addr::TEXT,
    CASE 
      -- For new tokens (< 24h), compare to actual launch price using historical ETH price
      WHEN ta.is_new_token THEN
        CASE 
          WHEN ta.launch_price_eth IS NULL OR ta.launch_price_eth = 0 OR ta.launch_eth_price_usd IS NULL THEN NULL
          ELSE ROUND(((cp.current_price - (ta.launch_price_eth * ta.launch_eth_price_usd)) / (ta.launch_price_eth * ta.launch_eth_price_usd) * 100)::NUMERIC, 2)
        END
      -- For older tokens (>= 24h), compare to 24h ago price
      ELSE
        CASE 
          WHEN p24.price_24h_ago IS NULL OR p24.price_24h_ago = 0 THEN NULL
          ELSE ROUND(((cp.current_price - p24.price_24h_ago) / p24.price_24h_ago * 100)::NUMERIC, 2)
        END
    END as price_change,
    ta.is_new_token as is_new
  FROM current_prices cp
  JOIN token_ages ta ON cp.addr = ta.addr
  LEFT JOIN prices_24h_ago p24 ON cp.addr = p24.addr;
$$;
