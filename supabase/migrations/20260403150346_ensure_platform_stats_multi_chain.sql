/*
  # Ensure Platform Stats Include All Chains
  
  1. Changes
    - Update platform stats function to explicitly aggregate across all chains
    - Add chain_id to the query for clarity
    - Ensure Base and Ethereum tokens are both included
  
  2. Impact
    - Platform statistics will show combined data from all supported chains
    - Total Market Cap, Total Liquidity, and Projects Listed will include both Ethereum and Base
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
  
  IF v_eth_price_usd IS NULL OR v_eth_price_usd = 0 THEN
    v_eth_price_usd := 3000;
  END IF;

  -- Calculate stats from ALL chains (Ethereum chain_id=1 AND Base chain_id=8453)
  -- No WHERE clause = aggregate across all chains
  FOR token_record IN 
    SELECT 
      token_address,
      chain_id,
      CAST(COALESCE(current_eth_reserve, initial_liquidity_eth) AS numeric) as eth_reserve,
      CAST(COALESCE(current_token_reserve, '1000000') AS numeric) as token_reserve,
      CAST(total_volume_eth AS numeric) as volume_eth
    FROM tokens
    -- Intentionally no WHERE chain_id filter - include all chains
  LOOP
    v_eth_reserve := token_record.eth_reserve;
    v_token_reserve := token_record.token_reserve;
    
    IF v_token_reserve > 0 AND v_eth_reserve > 0 THEN
      v_price_eth := v_eth_reserve / v_token_reserve;
      v_total_market_cap_usd := v_total_market_cap_usd + (v_price_eth * 1000000 * v_eth_price_usd);
    END IF;
    
    v_total_volume_eth := v_total_volume_eth + COALESCE(token_record.volume_eth, 0);
    v_token_count := v_token_count + 1;
  END LOOP;

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
