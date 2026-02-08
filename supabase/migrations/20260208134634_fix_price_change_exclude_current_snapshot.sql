/*
  # Fix Price Change to Exclude Current Snapshot from Baseline

  ## Summary
  Prevents the price change calculation from comparing current price to itself
  when the most recent snapshot is older than 12 hours.

  ## Issue
  - Current logic gets current price from most recent snapshot
  - Then looks for baseline snapshot older than 12h
  - If most recent snapshot IS older than 12h, it uses itself as baseline
  - Result: 0% change even when there are older snapshots available

  ## Fix
  - Store the current snapshot timestamp
  - Exclude current snapshot when finding baseline
  - Ensures we always compare to a DIFFERENT historical price point
*/

CREATE OR REPLACE FUNCTION recalculate_all_price_changes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  token_record RECORD;
  v_baseline_price_eth numeric;
  v_current_price_eth numeric;
  v_current_snapshot_time timestamptz;
  v_launch_price_eth numeric;
  v_price_change numeric;
  v_is_new boolean;
  v_has_recent_trades boolean;
BEGIN
  -- Loop through all tokens
  FOR token_record IN
    SELECT
      t.token_address,
      t.created_at,
      t.launch_price_eth,
      t.last_swap_at
    FROM tokens t
  LOOP
    -- Get current price and timestamp from most recent snapshot (same source as charts)
    SELECT price_eth::numeric, created_at
    INTO v_current_price_eth, v_current_snapshot_time
    FROM price_snapshots
    WHERE token_address = token_record.token_address
    ORDER BY created_at DESC
    LIMIT 1;

    -- Skip if no snapshot exists
    IF v_current_price_eth IS NULL OR v_current_price_eth <= 0 THEN
      CONTINUE;
    END IF;

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
        -- For older tokens, FIRST try to find snapshot from ~24 hours ago (22-26 hour window)
        -- EXCLUDING the current snapshot
        SELECT price_eth::numeric
        INTO v_baseline_price_eth
        FROM price_snapshots
        WHERE token_address = token_record.token_address
          AND created_at >= NOW() - INTERVAL '26 hours'
          AND created_at <= NOW() - INTERVAL '22 hours'
          AND created_at < v_current_snapshot_time  -- Exclude current snapshot
        ORDER BY ABS(EXTRACT(EPOCH FROM (NOW() - created_at - INTERVAL '24 hours')))
        LIMIT 1;

        -- If no snapshot in 24h window, fall back to most recent snapshot older than 12h
        -- EXCLUDING the current snapshot (this is the key fix)
        IF v_baseline_price_eth IS NULL THEN
          SELECT price_eth::numeric
          INTO v_baseline_price_eth
          FROM price_snapshots
          WHERE token_address = token_record.token_address
            AND created_at < v_current_snapshot_time  -- Must be OLDER than current
            AND created_at < NOW() - INTERVAL '12 hours'
          ORDER BY created_at DESC
          LIMIT 1;
        END IF;

        -- Calculate price change in ETH terms if we found any historical baseline
        IF v_baseline_price_eth IS NOT NULL AND v_baseline_price_eth > 0 AND v_current_price_eth > 0 THEN
          v_price_change := ((v_current_price_eth - v_baseline_price_eth) / v_baseline_price_eth) * 100;

          UPDATE tokens
          SET
            price_24h_ago = v_baseline_price_eth,
            price_change_24h = v_price_change,
            price_change_updated_at = NOW()
          WHERE token_address = token_record.token_address;
        ELSE
          -- No historical snapshot at all, clear price change
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

-- Run the function to recalculate with fixed baseline logic
SELECT recalculate_all_price_changes();
