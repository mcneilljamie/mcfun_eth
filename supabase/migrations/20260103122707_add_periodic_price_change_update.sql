/*
  # Add Periodic 24h Price Change Update

  1. Problem
    - price_change_24h cache only updates when NEW snapshots are inserted
    - If no trades occur, no snapshots are created, cache becomes stale
    - Tokens show "- 24h" when cache hasn't been updated recently

  2. Solution
    - Create scheduled job that runs every 5 minutes
    - Recalculates 24h price changes for all tokens based on existing snapshots
    - Ensures cache stays fresh even without new trading activity

  3. Changes
    - Create function to recalculate all token price changes
    - Set up pg_cron job to run function every 5 minutes
*/

-- Function to recalculate 24h price changes for all tokens
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
  v_token_created timestamptz;
  v_is_new boolean;
BEGIN
  -- Loop through all tokens that have price snapshots
  FOR token_record IN
    SELECT DISTINCT t.token_address, t.created_at, t.launch_price_eth, t.launch_eth_price_usd
    FROM tokens t
    WHERE EXISTS (
      SELECT 1 FROM price_snapshots ps
      WHERE ps.token_address = t.token_address
    )
  LOOP
    v_token_created := token_record.created_at;
    v_launch_price_eth := token_record.launch_price_eth::numeric;
    v_launch_eth_price_usd := token_record.launch_eth_price_usd::numeric;

    -- Get most recent price snapshot
    SELECT price_eth::numeric, eth_price_usd::numeric
    INTO v_current_price_eth, v_current_eth_price_usd
    FROM price_snapshots
    WHERE token_address = token_record.token_address
    ORDER BY created_at DESC
    LIMIT 1;

    -- Skip if no current price
    IF v_current_price_eth IS NULL OR v_current_eth_price_usd IS NULL THEN
      CONTINUE;
    END IF;

    v_current_price_usd := v_current_price_eth * v_current_eth_price_usd;

    -- Check if token is new (< 24 hours old)
    v_is_new := (NOW() - v_token_created) < INTERVAL '24 hours';

    IF v_is_new THEN
      -- For new tokens, compare to launch price
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

-- Schedule the job to run every 5 minutes
SELECT cron.schedule(
  'recalculate-price-changes',
  '*/5 * * * *',
  $$SELECT recalculate_all_price_changes()$$
);
