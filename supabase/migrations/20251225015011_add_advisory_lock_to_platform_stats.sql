/*
  # Add Advisory Lock Protection to Platform Stats Function

  1. Changes
    - Wrap `update_platform_stats()` function with PostgreSQL advisory lock
    - Use `pg_advisory_lock()` for blocking behavior (waits automatically)
    - Lock ID: hashtext('update_platform_stats') for unique lock identifier
    - Ensures only one instance of the function executes at a time
    - Lock is automatically released at transaction end

  2. Security
    - Prevents race conditions in platform stats calculation
    - Ensures sequential execution across all callers
    - No deadlocks possible as lock is automatically released
*/

-- Replace the update_platform_stats function with advisory lock protection
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
  v_token_reserve numeric;
  v_lock_id bigint;
BEGIN
  -- Generate consistent lock ID from function name
  v_lock_id := hashtext('update_platform_stats');
  
  -- Acquire advisory lock (blocks if another instance is running)
  PERFORM pg_advisory_lock(v_lock_id);
  
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
    
  EXCEPTION
    WHEN OTHERS THEN
      -- Release lock on error
      PERFORM pg_advisory_unlock(v_lock_id);
      RAISE;
  END;
  
  -- Release advisory lock
  PERFORM pg_advisory_unlock(v_lock_id);
END;
$$;
