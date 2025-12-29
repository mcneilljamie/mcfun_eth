/*
  # Fix Price Change to Use Most Recent Snapshot for Stale Data

  1. Problem
    - Current function falls back to OLDEST snapshot when no 24h snapshot exists
    - This causes incorrect negative percentages for tokens with stale snapshots
    - Should use MOST RECENT snapshot for tokens older than 24h with stale data

  2. Solution
    - For tokens < 24h old: Compare to oldest snapshot (launch price)
    - For tokens >= 24h old:
      - Try to find snapshot from 24h ago
      - If not found (stale data), use MOST RECENT snapshot instead
    - This matches the chart logic exactly

  3. Changes
    - Update update_24h_price_change_cache() function with correct fallback logic
    - Add token age check to determine which baseline to use
*/

-- Update function to match chart fallback logic
CREATE OR REPLACE FUNCTION update_24h_price_change_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_baseline_price numeric;
  v_current_price numeric;
  v_price_change numeric;
  v_token_age interval;
  v_is_new boolean;
BEGIN
  -- Get current price (from this snapshot)
  v_current_price := NEW.price_eth::numeric;

  -- Calculate token age
  SELECT NEW.created_at - created_at INTO v_token_age
  FROM tokens
  WHERE token_address = NEW.token_address;

  -- Check if token is newer than 24 hours
  v_is_new := v_token_age < INTERVAL '24 hours';

  IF v_is_new THEN
    -- For new tokens, compare to launch price (oldest snapshot)
    SELECT price_eth::numeric INTO v_baseline_price
    FROM price_snapshots
    WHERE token_address = NEW.token_address
      AND created_at < NEW.created_at
    ORDER BY created_at ASC
    LIMIT 1;

    -- If no older snapshot exists, use launch_price_eth
    IF v_baseline_price IS NULL THEN
      SELECT launch_price_eth::numeric INTO v_baseline_price
      FROM tokens
      WHERE token_address = NEW.token_address;
    END IF;
  ELSE
    -- For older tokens, try to get price from 24 hours ago
    SELECT price_eth::numeric INTO v_baseline_price
    FROM price_snapshots
    WHERE token_address = NEW.token_address
      AND created_at <= NEW.created_at - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT 1;

    -- If no snapshot from 24h ago (stale data), use MOST RECENT snapshot
    IF v_baseline_price IS NULL THEN
      SELECT price_eth::numeric INTO v_baseline_price
      FROM price_snapshots
      WHERE token_address = NEW.token_address
        AND created_at < NEW.created_at
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;
  END IF;

  -- Calculate price change percentage
  IF v_baseline_price IS NOT NULL AND v_baseline_price > 0 AND v_current_price > 0 THEN
    v_price_change := ((v_current_price - v_baseline_price) / v_baseline_price) * 100;

    -- Update the tokens table with cached values
    UPDATE tokens
    SET
      price_24h_ago = v_baseline_price,
      price_change_24h = v_price_change,
      price_change_updated_at = NOW()
    WHERE token_address = NEW.token_address;
  END IF;

  RETURN NEW;
END;
$$;