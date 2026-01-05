/*
  # Add Volume Check to Price Change Calculation

  1. Problem
    - Database calculates price changes for all new tokens, even those with no trading activity
    - Frontend had a condition `totalVolume > 0` for new tokens to avoid showing changes for tokens with no trades
    - When database updates via realtime, frontend recalculates and may show different values
    - This causes flickering in the UI

  2. Solution
    - Add volume check to database calculation to match frontend logic
    - Only calculate price changes for new tokens that have trading volume
    - This ensures database and frontend calculations stay in sync

  3. Changes
    - Update `recalculate_all_price_changes()` function to check total_volume_eth for new tokens
    - Only calculate price change if total_volume_eth > 0
    - This prevents misleading price changes for tokens with no trades
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
  v_total_volume numeric;
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
      t.current_token_reserve,
      t.total_volume_eth
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
    v_total_volume := COALESCE(token_record.total_volume_eth::numeric, 0);

    IF v_is_new THEN
      -- For new tokens, only calculate if there's trading volume
      IF v_total_volume > 0 THEN
        -- Compare to launch price
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
        -- No volume yet, clear price change to show null
        UPDATE tokens
        SET
          price_24h_ago = NULL,
          price_change_24h = NULL,
          price_change_updated_at = NOW()
        WHERE token_address = token_record.token_address
          AND price_change_24h IS NOT NULL;  -- Only update if previously set
      END IF;
    ELSE
      -- For older tokens, get FIRST snapshot AT OR AFTER 24h ago (matches frontend)
      SELECT price_eth::numeric, eth_price_usd::numeric
      INTO v_baseline_price_eth, v_baseline_eth_price_usd
      FROM price_snapshots
      WHERE token_address = token_record.token_address
        AND created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at ASC
      LIMIT 1;

      -- If no snapshot from 24h ago exists, use NEWEST available (matches frontend fallback)
      IF v_baseline_price_eth IS NULL THEN
        SELECT price_eth::numeric, eth_price_usd::numeric
        INTO v_baseline_price_eth, v_baseline_eth_price_usd
        FROM price_snapshots
        WHERE token_address = token_record.token_address
        ORDER BY created_at DESC
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

-- Run the updated function immediately to refresh all price changes with new logic
SELECT recalculate_all_price_changes();
