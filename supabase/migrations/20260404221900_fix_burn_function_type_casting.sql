/*
  # Fix Burn Function Type Casting

  1. Changes
    - Cast varchar columns to text to match function return type
    - Maintain all dynamic price calculations

  2. Issue
    - tokens.name and tokens.symbol are varchar(20)
    - Function expects text type in return columns
*/

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
    t.name::text as token_name,
    t.symbol::text as token_symbol,
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
