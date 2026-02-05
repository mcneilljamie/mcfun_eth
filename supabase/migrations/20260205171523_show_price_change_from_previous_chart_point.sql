/*
  # Show Price Change From Previous Chart Data Point

  1. Problem
    - Current logic tries to find a snapshot from exactly 24 hours ago
    - For tokens with sparse trading, there's often no snapshot within the 24h window
    - This causes the function to compare current price to itself (most recent vs most recent)
    - Results in ~0% change that gets filtered out by the 0.01% threshold

  2. Solution
    - For older tokens (>24h), compare current snapshot to the PREVIOUS snapshot
    - This shows the change since the last visible data point on the chart
    - Much more intuitive and meaningful for users
    - Example: MCFUN should show ~-15% (decline since last chart point)

  3. Changes
    - Update `recalculate_all_price_changes()` function
    - For older tokens: get second-most-recent snapshot as baseline
    - Compare current (most recent) to previous (second-most-recent)
    - Keep new token logic unchanged (compare to launch price)
    - Keep recent trades check (only show for tokens with activity)
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
  v_has_recent_trades boolean;
  v_current_snapshot_time timestamptz;
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
      t.current_eth_reserve,
      t.current_token_reserve,
      t.total_volume_eth,
      t.launch_price_eth,
      t.launch_eth_price_usd,
      t.last_swap_at
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

    -- Check if there have been trades in the last 24 hours
    v_has_recent_trades := token_record.last_swap_at IS NOT NULL
      AND (NOW() - token_record.last_swap_at) < INTERVAL '24 hours';

    -- Only show price change if there have been recent trades
    IF v_has_recent_trades THEN
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
        -- For older tokens, get the SECOND-MOST-RECENT snapshot (previous chart point)
        -- First get the most recent snapshot timestamp to exclude it
        SELECT created_at
        INTO v_current_snapshot_time
        FROM price_snapshots
        WHERE token_address = token_record.token_address
        ORDER BY created_at DESC
        LIMIT 1;

        -- Now get the second-most-recent (previous) snapshot
        SELECT price_eth::numeric, eth_price_usd::numeric
        INTO v_baseline_price_eth, v_baseline_eth_price_usd
        FROM price_snapshots
        WHERE token_address = token_record.token_address
          AND created_at < v_current_snapshot_time
        ORDER BY created_at DESC
        LIMIT 1;

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
        ELSE
          -- No previous snapshot (token only has one snapshot), clear price change
          UPDATE tokens
          SET
            price_24h_ago = NULL,
            price_change_24h = NULL,
            price_change_updated_at = NOW()
          WHERE token_address = token_record.token_address
            AND price_change_24h IS NOT NULL;
        END IF;
      END IF;
    ELSE
      -- No recent trades, clear price change to show null (displays as "-")
      UPDATE tokens
      SET
        price_24h_ago = NULL,
        price_change_24h = NULL,
        price_change_updated_at = NOW()
      WHERE token_address = token_record.token_address
        AND price_change_24h IS NOT NULL;  -- Only update if previously set
    END IF;
  END LOOP;
END;
$$;

-- Run the updated function immediately to refresh all price changes with new logic
SELECT recalculate_all_price_changes();
