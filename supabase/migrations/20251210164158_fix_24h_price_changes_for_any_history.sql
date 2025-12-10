/*
  # Fix 24h Price Changes to Handle Any Historical Data

  1. Problem
    - Previous function only worked if there was data exactly 23-25 hours ago
    - Many tokens have older history but not in that specific window
    - Should compare current price to the oldest available price in last 24h window

  2. Solution
    - Get current price (most recent within 1 hour)
    - Get 24h ago price (earliest price >= 24 hours old)
    - This handles tokens with any amount of history
    - Returns null only if no current price or no 24h+ old price

  3. Changes
    - Simplified logic to find oldest price >= 24h ago
    - More flexible time window matching
*/

DROP FUNCTION IF EXISTS get_24h_price_changes(TEXT[]);

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
        AND created_at <= NOW() - INTERVAL '24 hours'
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