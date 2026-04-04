/*
  # Fix Burn Values to Use Current Token Prices

  1. Changes
    - Update `get_top_burned_tokens` function to calculate USD values dynamically
    - Use current token reserves and ETH price instead of static stored values
    - Maintain burned amount from database, but recalculate value on each query

  2. Calculation
    - Token price in ETH = current_eth_reserve / current_token_reserve
    - Token price in USD = token_price_eth * current_eth_price
    - Total value USD = (total_amount_burned / 10^18) * token_price_usd

  3. Notes
    - Burn amounts are still tracked accurately
    - USD values now update as token prices change
    - Works for both Ethereum and Base chains
*/

-- Update function to calculate burn values dynamically based on current prices
CREATE OR REPLACE FUNCTION get_top_burned_tokens(limit_count integer DEFAULT 10)
RETURNS TABLE (
  token_address text,
  token_name text,
  token_symbol text,
  total_amount_burned numeric,
  total_value_usd numeric,
  burn_count integer,
  percent_supply_burned numeric,
  last_burn_timestamp timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tbt.token_address,
    t.name as token_name,
    t.symbol as token_symbol,
    tbt.total_amount_burned,
    -- Calculate current USD value dynamically
    CASE
      WHEN t.current_eth_reserve IS NOT NULL
        AND t.current_token_reserve IS NOT NULL
        AND t.current_token_reserve > 0
        AND eth.price_usd IS NOT NULL
      THEN
        -- Convert burned amount to decimal (divide by 10^18)
        (tbt.total_amount_burned / POWER(10, 18)::numeric) *
        -- Token price in ETH
        (t.current_eth_reserve::numeric / t.current_token_reserve::numeric) *
        -- ETH price in USD
        eth.price_usd::numeric
      ELSE
        0
    END as total_value_usd,
    tbt.burn_count,
    tbt.percent_supply_burned,
    tbt.last_burn_timestamp
  FROM token_burn_totals tbt
  LEFT JOIN tokens t ON LOWER(t.token_address) = LOWER(tbt.token_address) AND t.chain_id = tbt.chain_id
  LEFT JOIN LATERAL (
    SELECT price_usd
    FROM eth_price_history
    ORDER BY timestamp DESC
    LIMIT 1
  ) eth ON true
  ORDER BY
    -- Sort by calculated value, not stored value
    CASE
      WHEN t.current_eth_reserve IS NOT NULL
        AND t.current_token_reserve IS NOT NULL
        AND t.current_token_reserve > 0
        AND eth.price_usd IS NOT NULL
      THEN
        (tbt.total_amount_burned / POWER(10, 18)::numeric) *
        (t.current_eth_reserve::numeric / t.current_token_reserve::numeric) *
        eth.price_usd::numeric
      ELSE
        0
    END DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
