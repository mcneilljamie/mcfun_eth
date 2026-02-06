/*
  # Only Show 24h Change When Baseline is Actually Recent

  ## Summary
  Fixes misleading "24h change" percentages that are actually comparing to snapshots
  from 4-5 days ago due to low trading volume.

  ## Problem
  - Low-volume tokens have no trades for days
  - When they get a trade, "24h change" compares to last available snapshot
  - This could be 5+ days old, making the display misleading
  - Example: McFun showing "+0.37% (24h)" but actually comparing to 5 days ago

  ## Solution
  - Only show price change if baseline snapshot is within 36 hours
  - For new tokens (<24h old), always show vs launch price
  - For older tokens, require a reasonably recent baseline
  - Otherwise show NULL (displays as "-")

  ## Impact
  - More honest "24h change" display
  - Low-volume tokens will show "-" if no recent price history
  - Users won't be misled by stale comparisons
*/

CREATE OR REPLACE FUNCTION recalculate_all_price_changes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  token_record RECORD;
  v_baseline_price_eth numeric;
  v_baseline_created_at timestamptz;
  v_current_price_eth numeric;
  v_launch_price_eth numeric;
  v_price_change numeric;
  v_is_new boolean;
  v_has_recent_trades boolean;
  v_baseline_age_hours numeric;
BEGIN
  -- Loop through all tokens
  FOR token_record IN
    SELECT
      t.token_address,
      t.created_at,
      t.current_eth_reserve,
      t.current_token_reserve,
      t.launch_price_eth,
      t.last_swap_at
    FROM tokens t
    WHERE t.current_eth_reserve IS NOT NULL
      AND t.current_token_reserve IS NOT NULL
      AND t.current_eth_reserve::numeric > 0
      AND t.current_token_reserve::numeric > 0
  LOOP
    -- Calculate current price from blockchain reserves (in ETH)
    v_current_price_eth := token_record.current_eth_reserve::numeric / token_record.current_token_reserve::numeric;

    -- Check if token is new (< 24 hours old)
    v_is_new := (NOW() - token_record.created_at) < INTERVAL '24 hours';

    -- Check if there have been trades in the last 24 hours
    v_has_recent_trades := token_record.last_swap_at IS NOT NULL
      AND (NOW() - token_record.last_swap_at) < INTERVAL '24 hours';

    -- Only show price change if there have been recent trades
    IF v_has_recent_trades THEN
      IF v_is_new THEN
        -- For new tokens, compare to launch price (in ETH)
        v_launch_price_eth := token_record.launch_price_eth::numeric;

        IF v_launch_price_eth IS NOT NULL AND v_launch_price_eth > 0 AND v_current_price_eth > 0 THEN
          v_price_change := ((v_current_price_eth - v_launch_price_eth) / v_launch_price_eth) * 100;

          UPDATE tokens
          SET
            price_24h_ago = v_launch_price_eth,
            price_change_24h = v_price_change,
            price_change_updated_at = NOW()
          WHERE token_address = token_record.token_address;
        END IF;
      ELSE
        -- For older tokens, try to find snapshot from ~24 hours ago (22-26 hour window)
        SELECT price_eth::numeric, created_at
        INTO v_baseline_price_eth, v_baseline_created_at
        FROM price_snapshots
        WHERE token_address = token_record.token_address
          AND created_at >= NOW() - INTERVAL '26 hours'
          AND created_at <= NOW() - INTERVAL '22 hours'
        ORDER BY ABS(EXTRACT(EPOCH FROM (NOW() - created_at - INTERVAL '24 hours')))
        LIMIT 1;

        -- If no snapshot in ideal 24h window, try to find one within 36 hours
        IF v_baseline_price_eth IS NULL THEN
          SELECT price_eth::numeric, created_at
          INTO v_baseline_price_eth, v_baseline_created_at
          FROM price_snapshots
          WHERE token_address = token_record.token_address
            AND created_at >= NOW() - INTERVAL '36 hours'
            AND created_at < NOW() - INTERVAL '12 hours'
          ORDER BY created_at DESC
          LIMIT 1;
        END IF;

        -- Only use the baseline if it's reasonably recent (within 36 hours)
        IF v_baseline_price_eth IS NOT NULL AND v_baseline_created_at IS NOT NULL THEN
          v_baseline_age_hours := EXTRACT(EPOCH FROM (NOW() - v_baseline_created_at)) / 3600;
          
          -- Only show price change if baseline is within 36 hours
          IF v_baseline_age_hours <= 36 THEN
            IF v_baseline_price_eth > 0 AND v_current_price_eth > 0 THEN
              v_price_change := ((v_current_price_eth - v_baseline_price_eth) / v_baseline_price_eth) * 100;

              UPDATE tokens
              SET
                price_24h_ago = v_baseline_price_eth,
                price_change_24h = v_price_change,
                price_change_updated_at = NOW()
              WHERE token_address = token_record.token_address;
            END IF;
          ELSE
            -- Baseline too old, clear price change
            UPDATE tokens
            SET
              price_24h_ago = NULL,
              price_change_24h = NULL,
              price_change_updated_at = NOW()
            WHERE token_address = token_record.token_address
              AND price_change_24h IS NOT NULL;
          END IF;
        ELSE
          -- No historical snapshot, clear price change
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
      -- No recent trades, clear price change
      UPDATE tokens
      SET
        price_24h_ago = NULL,
        price_change_24h = NULL,
        price_change_updated_at = NOW()
      WHERE token_address = token_record.token_address
        AND price_change_24h IS NOT NULL;
    END IF;
  END LOOP;
END;
$$;

-- Run the function to recalculate with proper baseline age checks
SELECT recalculate_all_price_changes();