/*
  # Add Burn Aggregation Functions

  1. Functions
    - `get_aggregated_burns()` - Get total burns aggregated by token
    - `get_user_burned_tokens(user_addr)` - Get all burns for a specific user
    - `get_token_burn_stats(token_addr)` - Get burn statistics for a specific token

  2. Purpose
    - Show leaderboard of top burned McFun tokens by total value
    - Show user's burn history
    - Show token-specific burn data
*/

-- Function to get aggregated burns by token (for leaderboard)
CREATE OR REPLACE FUNCTION get_aggregated_burns()
RETURNS TABLE (
  token_address text,
  token_name text,
  token_symbol text,
  total_amount_burned numeric,
  total_value_usd numeric,
  burn_count bigint,
  last_burn_timestamp timestamptz
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tb.token_address,
    t.name as token_name,
    t.symbol as token_symbol,
    SUM(tb.amount) as total_amount_burned,
    SUM(
      CASE 
        WHEN t.address IS NOT NULL THEN
          -- McFun token: calculate value based on current reserves
          (tb.amount / POWER(10, 18)) * 
          (amm.eth_reserve / POWER(10, 18)) / 
          (amm.token_reserve / POWER(10, 18)) *
          COALESCE(tb.eth_price_usd, 3000)
        ELSE
          -- Non-McFun token: use a simple estimation or 0
          0
      END
    ) as total_value_usd,
    COUNT(*) as burn_count,
    MAX(tb.timestamp) as last_burn_timestamp
  FROM token_burns tb
  LEFT JOIN tokens t ON LOWER(t.address) = LOWER(tb.token_address)
  LEFT JOIN amm_pairs amm ON LOWER(amm.token_address) = LOWER(tb.token_address)
  GROUP BY tb.token_address, t.name, t.symbol, t.address, amm.eth_reserve, amm.token_reserve
  ORDER BY total_value_usd DESC NULLS LAST;
END;
$$;

-- Function to get user's burn history
CREATE OR REPLACE FUNCTION get_user_burned_tokens(user_addr text)
RETURNS TABLE (
  token_address text,
  token_name text,
  token_symbol text,
  amount_burned numeric,
  value_usd numeric,
  tx_hash text,
  burn_timestamp timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tb.token_address,
    t.name as token_name,
    t.symbol as token_symbol,
    tb.amount as amount_burned,
    CASE 
      WHEN t.address IS NOT NULL THEN
        (tb.amount / POWER(10, 18)) * 
        (amm.eth_reserve / POWER(10, 18)) / 
        (amm.token_reserve / POWER(10, 18)) *
        COALESCE(tb.eth_price_usd, 3000)
      ELSE
        0
    END as value_usd,
    tb.tx_hash,
    tb.timestamp as burn_timestamp
  FROM token_burns tb
  LEFT JOIN tokens t ON LOWER(t.address) = LOWER(tb.token_address)
  LEFT JOIN amm_pairs amm ON LOWER(amm.token_address) = LOWER(tb.token_address)
  WHERE LOWER(tb.burner_address) = LOWER(user_addr)
  ORDER BY tb.timestamp DESC;
END;
$$;

-- Function to get burn stats for a specific token
CREATE OR REPLACE FUNCTION get_token_burn_stats(token_addr text)
RETURNS TABLE (
  token_address text,
  token_name text,
  token_symbol text,
  total_amount_burned numeric,
  total_value_usd numeric,
  burn_count bigint,
  unique_burners bigint,
  last_burn_timestamp timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tb.token_address,
    t.name as token_name,
    t.symbol as token_symbol,
    SUM(tb.amount) as total_amount_burned,
    SUM(
      CASE 
        WHEN t.address IS NOT NULL THEN
          (tb.amount / POWER(10, 18)) * 
          (amm.eth_reserve / POWER(10, 18)) / 
          (amm.token_reserve / POWER(10, 18)) *
          COALESCE(tb.eth_price_usd, 3000)
        ELSE
          0
      END
    ) as total_value_usd,
    COUNT(*) as burn_count,
    COUNT(DISTINCT tb.burner_address) as unique_burners,
    MAX(tb.timestamp) as last_burn_timestamp
  FROM token_burns tb
  LEFT JOIN tokens t ON LOWER(t.address) = LOWER(tb.token_address)
  LEFT JOIN amm_pairs amm ON LOWER(amm.token_address) = LOWER(tb.token_address)
  WHERE LOWER(tb.token_address) = LOWER(token_addr)
  GROUP BY tb.token_address, t.name, t.symbol, t.address, amm.eth_reserve, amm.token_reserve;
END;
$$;