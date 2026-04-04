/*
  # Add Total Locked Value to Platform Statistics

  1. Changes
    - Add `total_locked_usd` column to platform_stats table
    - Update `update_platform_stats` function to calculate total locked value across all chains
    - Calculate dynamically based on current token prices and ETH price

  2. Calculation
    - For each locked token: (locked_amount / 10^18) * token_price_eth * eth_price_usd
    - Sum across all non-withdrawn locks on all chains
*/

-- Add total_locked_usd column to platform_stats
ALTER TABLE platform_stats 
ADD COLUMN IF NOT EXISTS total_locked_usd numeric DEFAULT 0;

-- Update function to include total locked calculation
CREATE OR REPLACE FUNCTION update_platform_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_market_cap_usd numeric := 0;
  v_total_volume_eth numeric := 0;
  v_total_burned_usd numeric := 0;
  v_total_locked_usd numeric := 0;
  v_token_count integer := 0;
  v_eth_price_usd numeric := 3000;
  token_record RECORD;
  burn_record RECORD;
  lock_record RECORD;
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
  FOR token_record IN 
    SELECT 
      token_address,
      chain_id,
      CAST(COALESCE(current_eth_reserve, initial_liquidity_eth) AS numeric) as eth_reserve,
      CAST(COALESCE(current_token_reserve, '1000000') AS numeric) as token_reserve,
      CAST(total_volume_eth AS numeric) as volume_eth
    FROM tokens
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

  -- Calculate total burned value across all tokens
  FOR burn_record IN
    SELECT 
      tbt.token_address,
      tbt.chain_id,
      tbt.total_amount_burned,
      t.current_eth_reserve,
      t.current_token_reserve
    FROM token_burn_totals tbt
    LEFT JOIN tokens t ON LOWER(t.token_address) = LOWER(tbt.token_address) AND t.chain_id = tbt.chain_id
    WHERE t.current_eth_reserve IS NOT NULL
      AND t.current_token_reserve IS NOT NULL
      AND t.current_token_reserve > 0
  LOOP
    v_eth_reserve := CAST(burn_record.current_eth_reserve AS numeric);
    v_token_reserve := CAST(burn_record.current_token_reserve AS numeric);
    
    IF v_token_reserve > 0 AND v_eth_reserve > 0 THEN
      v_price_eth := v_eth_reserve / v_token_reserve;
      -- Convert burned amount to decimal and calculate USD value
      v_total_burned_usd := v_total_burned_usd + 
        ((burn_record.total_amount_burned / POWER(10, 18)::numeric) * v_price_eth * v_eth_price_usd);
    END IF;
  END LOOP;

  -- Calculate total locked value across all tokens (non-withdrawn locks only)
  FOR lock_record IN
    SELECT 
      tl.token_address,
      tl.chain_id,
      tl.amount,
      tl.unlock_time,
      t.current_eth_reserve,
      t.current_token_reserve,
      t.token_address as mcfun_token
    FROM token_locks tl
    LEFT JOIN tokens t ON LOWER(t.token_address) = LOWER(tl.token_address) AND t.chain_id = tl.chain_id
    WHERE tl.withdrawn = false
      AND tl.amount > 0
  LOOP
    -- Check if this is a McFun token (exists in tokens table)
    IF lock_record.mcfun_token IS NOT NULL AND lock_record.current_eth_reserve IS NOT NULL THEN
      -- McFun token - use current reserves to calculate price
      v_eth_reserve := CAST(lock_record.current_eth_reserve AS numeric);
      v_token_reserve := CAST(lock_record.current_token_reserve AS numeric);
      
      IF v_token_reserve > 0 AND v_eth_reserve > 0 THEN
        v_price_eth := v_eth_reserve / v_token_reserve;
        v_total_locked_usd := v_total_locked_usd + 
          ((lock_record.amount / POWER(10, 18)::numeric) * v_price_eth * v_eth_price_usd);
      END IF;
    ELSE
      -- External token - value is zero for platform stats (we don't track external token prices)
      -- Could be extended in the future to fetch external token prices
      NULL;
    END IF;
  END LOOP;

  INSERT INTO platform_stats (
    total_market_cap_usd,
    total_volume_eth,
    total_burned_usd,
    total_locked_usd,
    token_count,
    created_at
  ) VALUES (
    v_total_market_cap_usd,
    v_total_volume_eth,
    v_total_burned_usd,
    v_total_locked_usd,
    v_token_count,
    NOW()
  );
END;
$$;
