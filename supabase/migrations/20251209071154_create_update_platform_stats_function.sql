/*
  # Create Function to Update Platform Stats

  1. New Function
    - `update_platform_stats()` - Calculates and inserts current platform statistics
    - Can be called manually or by triggers
    - Calculates market cap, volume, and token count from tokens table
  
  2. Purpose
    - Provide a way to populate platform_stats without requiring price_snapshots
    - Calculate market cap from current token reserves
    - Aggregate total trading volume
  
  3. Usage
    - Can be called manually: SELECT update_platform_stats();
    - Will be used to seed initial platform statistics
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
  v_eth_price_usd numeric := 3000; -- Default ETH price
  token_record RECORD;
  v_price_eth numeric;
  v_token_reserve numeric;
BEGIN
  -- Get ETH price from latest price snapshot if available
  SELECT eth_price_usd INTO v_eth_price_usd
  FROM price_snapshots
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- If no price snapshot, use default
  IF v_eth_price_usd IS NULL THEN
    v_eth_price_usd := 3000;
  END IF;

  -- Calculate stats from tokens table
  FOR token_record IN 
    SELECT 
      token_address,
      CAST(current_eth_reserve AS numeric) as eth_reserve,
      CAST(current_token_reserve AS numeric) as token_reserve,
      CAST(total_volume_eth AS numeric) as volume_eth
    FROM tokens
    WHERE current_eth_reserve IS NOT NULL
  LOOP
    -- Calculate token price in ETH
    IF token_record.token_reserve > 0 THEN
      v_price_eth := token_record.eth_reserve / token_record.token_reserve;
      
      -- Calculate market cap (FDV = price * total supply)
      -- Total supply is 1,000,000 tokens
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

-- Execute the function to populate initial stats
SELECT update_platform_stats();
