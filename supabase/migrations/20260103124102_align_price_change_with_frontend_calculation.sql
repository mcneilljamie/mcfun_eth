/*
  # Align Database Price Change Calculation with Frontend PriceChart Logic

  1. Problem
    - Database uses "last snapshot BEFORE 24h ago" as baseline
    - Frontend PriceChart uses "first snapshot AT OR AFTER 24h ago" as baseline
    - This causes discrepancies: TokenDetail shows +7.32%, Popular Tokens shows +0.00%
    - Example: If snapshots exist at 23h ago and 25h ago:
      - Current DB: compares to 25h ago snapshot (older = bigger change or 0%)
      - Frontend: compares to 23h ago snapshot (closer to 24h = accurate change)

  2. Solution
    - Update baseline selection to match frontend algorithm exactly
    - For tokens >= 24h old: find FIRST snapshot AT OR AFTER 24h ago
    - Fallback: if no 24h snapshot exists, use NEWEST available (not oldest)
    - This matches PriceChart.tsx lines 69-80

  3. Changes
    - Line 108: Change `<=` to `>=` (get snapshots after cutoff, not before)
    - Line 109: Change `DESC` to `ASC` (get first after cutoff, not last before)
    - Line 118: Change `ASC` to `DESC` (fallback to newest, not oldest)

  4. Impact
    - Both pages will show identical price change values
    - Popular Tokens will match TokenDetail real-time calculations
    - More accurate 24h changes (uses closer-to-24h baseline)
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
      -- For older tokens, get FIRST snapshot AT OR AFTER 24h ago (matches frontend)
      SELECT price_eth::numeric, eth_price_usd::numeric
      INTO v_baseline_price_eth, v_baseline_eth_price_usd
      FROM price_snapshots
      WHERE token_address = token_record.token_address
        AND created_at >= NOW() - INTERVAL '24 hours'  -- Changed from <= to >=
      ORDER BY created_at ASC  -- Changed from DESC to ASC (get first, not last)
      LIMIT 1;

      -- If no snapshot from 24h ago exists, use NEWEST available (matches frontend fallback)
      IF v_baseline_price_eth IS NULL THEN
        SELECT price_eth::numeric, eth_price_usd::numeric
        INTO v_baseline_price_eth, v_baseline_eth_price_usd
        FROM price_snapshots
        WHERE token_address = token_record.token_address
        ORDER BY created_at DESC  -- Changed from ASC to DESC (get newest, not oldest)
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

-- Run the updated function immediately to refresh all price changes with new calculation
SELECT recalculate_all_price_changes();
