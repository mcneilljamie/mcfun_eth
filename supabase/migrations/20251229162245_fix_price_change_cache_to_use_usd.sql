/*
  # Fix Price Change Cache to Use USD Prices

  1. Problem
    - update_24h_price_change_cache() uses ETH-denominated prices
    - Chart uses USD-denominated prices (price_eth * eth_price_usd)
    - This causes discrepancy: chart shows +49.79% but tokens list shows nothing
    - When ETH price changes, percentage changes incorrectly

  2. Solution
    - Update trigger to calculate using USD prices like the chart
    - Current price USD = price_eth * eth_price_usd (from snapshot)
    - Launch price USD = launch_price_eth * launch_eth_price_usd (from tokens table)
    - Baseline price USD = baseline_price_eth * baseline_eth_price_usd (from snapshot)
    - This matches get_price_chart_data_optimized() exactly

  3. Changes
    - Modify update_24h_price_change_cache() to use USD calculation
    - For new tokens: compare current USD price to launch USD price
    - For old tokens: compare current USD price to 24h ago USD price
    - Backfill all tokens with correct USD-based percentages
*/

-- Update trigger function to use USD-based calculations
CREATE OR REPLACE FUNCTION update_24h_price_change_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
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
  v_token_age interval;
  v_is_new boolean;
BEGIN
  -- Get current price in USD (from this snapshot)
  v_current_price_eth := NEW.price_eth::numeric;
  v_current_eth_price_usd := NEW.eth_price_usd::numeric;
  v_current_price_usd := v_current_price_eth * v_current_eth_price_usd;

  -- Get launch prices from tokens table
  SELECT launch_price_eth::numeric, launch_eth_price_usd::numeric
  INTO v_launch_price_eth, v_launch_eth_price_usd
  FROM tokens
  WHERE token_address = NEW.token_address;

  -- Calculate launch price in USD
  IF v_launch_price_eth IS NOT NULL AND v_launch_eth_price_usd IS NOT NULL THEN
    v_launch_price_usd := v_launch_price_eth * v_launch_eth_price_usd;
  END IF;

  -- Calculate token age
  SELECT NEW.created_at - created_at INTO v_token_age
  FROM tokens
  WHERE token_address = NEW.token_address;

  -- Check if token is newer than 24 hours
  v_is_new := v_token_age < INTERVAL '24 hours';

  IF v_is_new THEN
    -- For new tokens, use launch price as baseline
    IF v_launch_price_usd IS NOT NULL AND v_launch_price_usd > 0 AND v_current_price_usd > 0 THEN
      v_price_change := ((v_current_price_usd - v_launch_price_usd) / v_launch_price_usd) * 100;

      -- Update the tokens table with cached values
      UPDATE tokens
      SET
        price_24h_ago = v_launch_price_eth,
        price_change_24h = v_price_change,
        price_change_updated_at = NOW()
      WHERE token_address = NEW.token_address;
    END IF;
  ELSE
    -- For older tokens, try to get price from 24 hours ago
    SELECT price_eth::numeric, eth_price_usd::numeric
    INTO v_baseline_price_eth, v_baseline_eth_price_usd
    FROM price_snapshots
    WHERE token_address = NEW.token_address
      AND created_at <= NEW.created_at - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT 1;

    -- If no snapshot from 24h ago, use most recent snapshot
    IF v_baseline_price_eth IS NULL THEN
      SELECT price_eth::numeric, eth_price_usd::numeric
      INTO v_baseline_price_eth, v_baseline_eth_price_usd
      FROM price_snapshots
      WHERE token_address = NEW.token_address
        AND created_at < NEW.created_at
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    -- Calculate baseline price in USD
    IF v_baseline_price_eth IS NOT NULL AND v_baseline_eth_price_usd IS NOT NULL THEN
      v_baseline_price_usd := v_baseline_price_eth * v_baseline_eth_price_usd;
    END IF;

    -- Calculate price change percentage using USD prices
    IF v_baseline_price_usd IS NOT NULL AND v_baseline_price_usd > 0 AND v_current_price_usd > 0 THEN
      v_price_change := ((v_current_price_usd - v_baseline_price_usd) / v_baseline_price_usd) * 100;

      -- Update the tokens table with cached values
      UPDATE tokens
      SET
        price_24h_ago = v_baseline_price_eth,
        price_change_24h = v_price_change,
        price_change_updated_at = NOW()
      WHERE token_address = NEW.token_address;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: Recalculate price changes for all tokens using USD-based calculation
DO $$
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
  FOR token_record IN
    SELECT DISTINCT token_address
    FROM price_snapshots
  LOOP
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

    -- Get token info
    SELECT created_at, launch_price_eth::numeric, launch_eth_price_usd::numeric
    INTO v_token_created, v_launch_price_eth, v_launch_eth_price_usd
    FROM tokens
    WHERE token_address = token_record.token_address;

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
END $$;
