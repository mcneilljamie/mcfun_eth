/*
  # Fix get_top_burned_tokens Type Mismatch

  1. Changes
    - Cast varchar columns to text to match function return type
    - Ensures function works with tokens table varchar constraints
*/

-- Drop and recreate function with proper type casting
DROP FUNCTION IF EXISTS get_top_burned_tokens(integer);

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
    tbt.total_value_usd,
    tbt.burn_count,
    tbt.percent_supply_burned,
    tbt.last_burn_timestamp
  FROM token_burn_totals tbt
  LEFT JOIN tokens t ON t.token_address = tbt.token_address
  WHERE tbt.burn_count > 0
  ORDER BY tbt.total_amount_burned DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
