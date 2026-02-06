/*
  # Show Price Change From Last Known Price Point

  ## Summary
  Reverts the strict 36-hour baseline requirement. For low-volume tokens, 
  show price change from the last known price point, even if it's several days old.

  ## Rationale
  - Low-volume tokens may have days between trades
  - When a trade happens, users want to see the price moved
  - "24h change" for these tokens means "change from last known price"
  - Better to show movement than hide it with "-"

  ## Behavior
  - Recent trades (< 24h): Always show price change
  - Comparison priority:
    1. Snapshot from ~24h ago (22-26h window) if available
    2. Most recent snapshot older than 12h if no 24h snapshot
  - No strict age limit on baseline snapshots
  - For new tokens (< 24h old): Compare to launch price
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
        -- For older tokens, FIRST try to find snapshot from ~24 hours ago (22-26 hour window)
        SELECT price_eth::numeric
        INTO v_baseline_price_eth
        FROM price_snapshots
        WHERE token_address = token_record.token_address
          AND created_at >= NOW() - INTERVAL '26 hours'
          AND created_at <= NOW() - INTERVAL '22 hours'
        ORDER BY ABS(EXTRACT(EPOCH FROM (NOW() - created_at - INTERVAL '24 hours')))
        LIMIT 1;

        -- If no snapshot in 24h window, fall back to most recent snapshot older than 12h
        -- (No age limit - show change from last known price even if days old)
        IF v_baseline_price_eth IS NULL THEN
          SELECT price_eth::numeric
          INTO v_baseline_price_eth
          FROM price_snapshots
          WHERE token_address = token_record.token_address
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

-- Run the function to recalculate with restored fallback behavior
SELECT recalculate_all_price_changes();