/*
  # Implement Strict 24-Hour Price Change

  1. Problem
    - Current logic compares current price to the previous snapshot
    - This could be 1 hour, 3 hours, or days ago - not actually "24 hours"
    - Misleading for users who expect true 24-hour change

  2. Solution
    - For tokens > 24 hours old: find snapshot from ~24 hours ago (within 22-26 hour window)
    - Only show price change if such a snapshot exists
    - If no snapshot exists in the window, show NULL (displays as "-")
    - For new tokens < 24 hours: keep existing logic (compare to launch price)

  3. Changes
    - Update `recalculate_all_price_changes()` function
    - Look for snapshot between 22-26 hours ago
    - Use STRICT 24-hour comparison window
    - Clear price change if no valid baseline found
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
        -- For older tokens, find snapshot from ~24 hours ago (within 22-26 hour window)
        SELECT price_eth::numeric, eth_price_usd::numeric
        INTO v_baseline_price_eth, v_baseline_eth_price_usd
        FROM price_snapshots
        WHERE token_address = token_record.token_address
          AND created_at >= NOW() - INTERVAL '26 hours'
          AND created_at <= NOW() - INTERVAL '22 hours'
        ORDER BY ABS(EXTRACT(EPOCH FROM (NOW() - created_at - INTERVAL '24 hours')))
        LIMIT 1;

        -- Calculate using USD prices if we found a valid 24h baseline
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
          -- No snapshot within 24-hour window, clear price change
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

-- Run the updated function immediately to refresh all price changes with strict 24h logic
SELECT recalculate_all_price_changes();
