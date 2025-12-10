/*
  # Update Price Changes to Match Chart Display Logic

  1. Problem
    - Popular Tokens page was using simple 24h comparison
    - Chart uses different logic: "Since Launch" for new tokens, "24h" for older tokens
    - Percentages didn't match between pages

  2. Solution
    - For tokens < 24 hours old: Compare current price to first price (launch)
    - For tokens >= 24 hours old: Compare current price to price 24h ago
    - This matches the useChartData hook logic exactly

  3. Returns
    - token_address: Token address
    - price_change: Percentage change
    - is_new: Boolean indicating if token is < 24h old
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
    SELECT t.token_address as addr, t.created_at as token_created_at
    FROM tokens t
    WHERE p_token_addresses IS NULL
       OR t.token_address = ANY(p_token_addresses)
  ),
  token_ages AS (
    SELECT 
      addr,
      token_created_at,
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
  first_prices AS (
    SELECT 
      tc.addr,
      (ps.price_eth * ps.eth_price_usd) as first_price
    FROM tokens_to_check tc
    CROSS JOIN LATERAL (
      SELECT price_eth, eth_price_usd
      FROM price_snapshots
      WHERE price_snapshots.token_address = tc.addr
      ORDER BY created_at ASC
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
      -- For new tokens (< 24h), compare to first price (launch)
      WHEN ta.is_new_token THEN
        CASE 
          WHEN fp.first_price IS NULL OR fp.first_price = 0 THEN NULL
          ELSE ROUND(((cp.current_price - fp.first_price) / fp.first_price * 100)::NUMERIC, 2)
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
  LEFT JOIN first_prices fp ON cp.addr = fp.addr
  LEFT JOIN prices_24h_ago p24 ON cp.addr = p24.addr;
$$;