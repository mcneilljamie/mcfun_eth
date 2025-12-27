/*
  # Add Percent Supply Burned to Burn Aggregation Functions

  1. Changes
    - Add `percent_supply_burned` column to `get_aggregated_burns()` function
    - Calculate percentage based on McFun token total supply of 1,000,000 tokens
    - Continue ranking by USD value burned as primary sort

  2. Details
    - Total supply: 1,000,000 tokens = 1e24 wei (1e6 * 1e18)
    - Percentage = (total_amount_burned / 1e24) * 100
    - Display format: percentage with 2 decimal places

  This helps users understand burn impact relative to total token supply
  while maintaining USD value as the primary ranking metric.
*/

-- Drop the existing function to allow changing return type
DROP FUNCTION IF EXISTS get_aggregated_burns();

-- Recreate with percent_supply_burned column
CREATE OR REPLACE FUNCTION get_aggregated_burns()
RETURNS TABLE (
  token_address text,
  token_name text,
  token_symbol text,
  total_amount_burned numeric,
  total_value_usd numeric,
  percent_supply_burned numeric,
  burn_count bigint,
  last_burn_timestamp timestamptz
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  TOTAL_SUPPLY constant numeric := 1000000 * POWER(10, 18); -- 1M tokens in wei
BEGIN
  RETURN QUERY
  SELECT 
    tb.token_address,
    t.name::text as token_name,
    t.symbol::text as token_symbol,
    SUM(tb.amount) as total_amount_burned,
    SUM(
      CASE 
        WHEN t.token_address IS NOT NULL THEN
          (
            (tb.amount / POWER(10, 18)) * 
            (t.current_eth_reserve / POWER(10, 18)) / 
            (t.current_token_reserve / POWER(10, 18)) *
            COALESCE(tb.eth_price_usd, 3000)
          )::numeric
        ELSE
          0
      END
    ) as total_value_usd,
    ((SUM(tb.amount) / TOTAL_SUPPLY) * 100)::numeric as percent_supply_burned,
    COUNT(*) as burn_count,
    MAX(tb.timestamp) as last_burn_timestamp
  FROM token_burns tb
  LEFT JOIN tokens t ON LOWER(t.token_address) = LOWER(tb.token_address)
  GROUP BY tb.token_address, t.name, t.symbol, t.token_address, t.current_eth_reserve, t.current_token_reserve
  ORDER BY total_value_usd DESC NULLS LAST;
END;
$$;
