/*
  # Use Current ETH Price for Platform Stats
  
  1. Changes
    - Update platform stats to use current ETH price from eth_price_history
    - This table contains the live ETH price from CoinGecko
    - Historical snapshots keep their historical prices for chart data
  
  2. Impact
    - Total market cap will update based on current ETH price
    - Matches what the Tokens page displays with live CoinGecko prices
*/

CREATE OR REPLACE FUNCTION update_platform_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_market_cap_usd numeric := 0;
  v_total_volume_eth numeric := 0;
  v_token_count integer := 0;
  v_eth_price_usd numeric := 3000;
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
  
  -- If no price history, use default
  IF v_eth_price_usd IS NULL OR v_eth_price_usd = 0 THEN
    v_eth_price_usd := 3000;
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
