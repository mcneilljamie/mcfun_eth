/*
  # Fix Price Change Calculation to Use Current Blockchain Reserves

  1. Problem
    - recalculate_all_price_changes() uses latest snapshot as "current price"
    - Snapshots only created on trades, so latest can be days old
    - Comparing old snapshot to older snapshot shows 0% change
    - Tokens show "- 24h" or "0.00% 24h" when there's no recent trading

  2. Solution
    - Use CURRENT reserves from tokens table (updated by sync-reserves)
    - Get latest ETH/USD price from eth_price_history
    - Calculate current price: (current_eth_reserve / current_token_reserve) * eth_usd
    - Compare current price to snapshot from 24h ago
    - Shows accurate price changes even without recent trades

  3. Changes
    - Modify recalculate_all_price_changes() to use current reserves
    - Get latest ETH price from eth_price_history table
    - Calculate real-time price change vs 24h historical snapshot
*/

CREATE OR REPLACE FUNCTION recalculate_all_price_changes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  token_record RECORD;
  v_baseline_price_eth numeric;
  v_baseline_eth_price_usd numeric;
  v_baseline_price_usd numeric;
  v_current_price_eth numeric;
  v_current_eth_price_usd numeric;
  v_current_price_usd numeric;
  v_launch_price_eth numeric;
  v_launch_eth_price_usd numeric;
  v_launch_price_usd numeric;
  v_price_change numeric;
  v_is_new boolean;
BEGIN
  -- Get latest ETH price in USD
  SELECT price_usd::numeric INTO v_current_eth_price_usd
  FROM eth_price_history
  ORDER BY created_at DESC
  LIMIT 1;

  -- Fallback to price_snapshots if eth_price_history is empty
  IF v_current_eth_price_usd IS NULL THEN
    SELECT eth_price_usd::numeric INTO v_current_eth_price_usd
    FROM price_snapshots
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Skip if we can't get ETH price
  IF v_current_eth_price_usd IS NULL OR v_current_eth_price_usd = 0 THEN
    RETURN;
  END IF;

  -- Loop through all tokens
  FOR token_record IN
    SELECT 
      t.token_address, 
      t.created_at, 
      t.launch_price_eth, 
      t.launch_eth_price_usd,
      t.current_eth_reserve,
      t.current_token_reserve
    FROM tokens t
    WHERE t.current_eth_reserve IS NOT NULL 
      AND t.current_token_reserve IS NOT NULL
      AND t.current_eth_reserve::numeric > 0
      AND t.current_token_reserve::numeric > 0
  LOOP
    -- Calculate current price from blockchain reserves
    v_current_price_eth := token_record.current_eth_reserve::numeric / token_record.current_token_reserve::numeric;
    v_current_price_usd := v_current_price_eth * v_current_eth_price_usd;

    -- Check if token is new (< 24 hours old)
    v_is_new := (NOW() - token_record.created_at) < INTERVAL '24 hours';

    IF v_is_new THEN
      -- For new tokens, compare to launch price
      v_launch_price_eth := token_record.launch_price_eth::numeric;
      v_launch_eth_price_usd := token_record.launch_eth_price_usd::numeric;

      IF v_launch_price_eth IS NOT NULL AND v_launch_eth_price_usd IS NOT NULL THEN
        v_launch_price_usd := v_launch_price_eth * v_launch_eth_price_usd;

        IF v_launch_price_usd > 0 AND v_current_price_usd > 0 THEN
          v_price_change := ((v_current_price_usd - v_launch_price_usd) / v_launch_price_usd) * 100;

          UPDATE tokens
          SET
            price_24h_ago = v_launch_price_eth,
            price_change_24h = v_price_change,
            price_change_updated_at = NOW()
          WHERE token_address = token_record.token_address;
        END IF;
      END IF;
    ELSE
      -- For older tokens, get price from 24 hours ago
      SELECT price_eth::numeric, eth_price_usd::numeric
      INTO v_baseline_price_eth, v_baseline_eth_price_usd
      FROM price_snapshots
      WHERE token_address = token_record.token_address
        AND created_at <= NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 1;

      -- If no 24h snapshot, use oldest available
      IF v_baseline_price_eth IS NULL THEN
        SELECT price_eth::numeric, eth_price_usd::numeric
        INTO v_baseline_price_eth, v_baseline_eth_price_usd
        FROM price_snapshots
        WHERE token_address = token_record.token_address
        ORDER BY created_at ASC
        LIMIT 1;
      END IF;

      -- Calculate using USD prices
      IF v_baseline_price_eth IS NOT NULL AND v_baseline_eth_price_usd IS NOT NULL THEN
        v_baseline_price_usd := v_baseline_price_eth * v_baseline_eth_price_usd;

        IF v_baseline_price_usd > 0 AND v_current_price_usd > 0 THEN
          v_price_change := ((v_current_price_usd - v_baseline_price_usd) / v_baseline_price_usd) * 100;

          UPDATE tokens
          SET
            price_24h_ago = v_baseline_price_eth,
            price_change_24h = v_price_change,
            price_change_updated_at = NOW()
          WHERE token_address = token_record.token_address;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Run the updated function immediately to refresh all price changes
SELECT recalculate_all_price_changes();
