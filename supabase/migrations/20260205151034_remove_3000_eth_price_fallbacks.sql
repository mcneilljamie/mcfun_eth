/*
  # Remove $3000 ETH Price Fallbacks

  1. Changes
    - Update `get_aggregated_burns` to fetch ETH price from eth_price_history instead of using $3000 fallback
    - Update `update_platform_stats` to fetch ETH price more reliably without $3000 fallback
    
  2. Notes
    - These functions will now use real ETH price data from the database
    - If no ETH price is available, calculations will use 0 to avoid displaying incorrect data
*/

-- Update get_aggregated_burns to fetch current ETH price from database
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
  TOTAL_SUPPLY constant numeric := 1000000 * POWER(10, 18);
  v_current_eth_price numeric;
BEGIN
  -- Get current ETH price from database
  SELECT price_usd INTO v_current_eth_price
  FROM eth_price_history
  ORDER BY timestamp DESC
  LIMIT 1;
  
  -- If no price available, use 0 to avoid incorrect data
  IF v_current_eth_price IS NULL THEN
    v_current_eth_price := 0;
  END IF;

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
            COALESCE(tb.eth_price_usd, v_current_eth_price)
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

-- Update update_platform_stats to not use $3000 fallback
CREATE OR REPLACE FUNCTION update_platform_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_market_cap_usd numeric := 0;
  v_total_volume_eth numeric := 0;
  v_token_count integer := 0;
  v_eth_price_usd numeric := 0;
  token_record RECORD;
  v_price_eth numeric;
  v_eth_reserve numeric;
  v_token_reserve numeric;
BEGIN
  -- Get CURRENT ETH price from CoinGecko tracking table
  SELECT price_usd INTO v_eth_price_usd
  FROM eth_price_history
  ORDER BY timestamp DESC
  LIMIT 1;

  -- If no price history, skip USD calculations
  IF v_eth_price_usd IS NULL OR v_eth_price_usd = 0 THEN
    RAISE NOTICE 'No ETH price available, skipping platform stats update';
    RETURN;
  END IF;

  -- Calculate stats from tokens table using CURRENT ETH price
  FOR token_record IN 
    SELECT 
      token_address,
      CAST(COALESCE(current_eth_reserve, initial_liquidity_eth) AS numeric) as eth_reserve,
      CAST(COALESCE(current_token_reserve, '1000000') AS numeric) as token_reserve,
      CAST(total_volume_eth AS numeric) as volume_eth
    FROM tokens
  LOOP
    v_eth_reserve := token_record.eth_reserve;
    v_token_reserve := token_record.token_reserve;

    -- Calculate token price in ETH
    IF v_token_reserve > 0 AND v_eth_reserve > 0 THEN
      v_price_eth := v_eth_reserve / v_token_reserve;

      -- Calculate market cap using CURRENT live ETH price (FDV = price * total supply)
      v_total_market_cap_usd := v_total_market_cap_usd + (v_price_eth * 1000000 * v_eth_price_usd);
    END IF;

    -- Add to total volume
    v_total_volume_eth := v_total_volume_eth + COALESCE(token_record.volume_eth, 0);

    -- Count tokens
    v_token_count := v_token_count + 1;
  END LOOP;

  -- Insert platform stats
  INSERT INTO platform_stats (
    total_market_cap_usd,
    total_volume_eth,
    token_count,
    created_at
  ) VALUES (
    v_total_market_cap_usd,
    v_total_volume_eth,
    v_token_count,
    NOW()
  );
END;
$$;
