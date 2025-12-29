/*
  # Fix 24-Hour Price Change to Always Show Value

  1. Problem
    - Price change can be NULL when there's no snapshot from 24h ago
    - For new tokens or tokens with quiet periods, we should always show comparison to earliest available price
    - Users expect to see performance metrics even for brand new tokens

  2. Solution
    - If no 24h snapshot exists, compare to oldest available snapshot
    - If only one snapshot exists (brand new token), use launch_price_eth as baseline
    - Ensure price_change_24h is NEVER null when price history exists

  3. Changes
    - Improve update_24h_price_change_cache() function logic
    - Add fallback to launch_price_eth for first trade
    - Always calculate and store price change when possible
*/

-- Update function to always calculate price change when possible
CREATE OR REPLACE FUNCTION update_24h_price_change_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price_24h_ago numeric;
  v_current_price numeric;
  v_price_change numeric;
  v_launch_price numeric;
BEGIN
  -- Get current price (from this snapshot)
  v_current_price := NEW.price_eth::numeric;

  -- Get price from 24 hours ago (or closest available)
  SELECT price_eth::numeric INTO v_price_24h_ago
  FROM price_snapshots
  WHERE token_address = NEW.token_address
    AND created_at <= NEW.created_at - INTERVAL '24 hours'
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no snapshot from 24h ago, try to get the oldest available snapshot
  IF v_price_24h_ago IS NULL THEN
    SELECT price_eth::numeric INTO v_price_24h_ago
    FROM price_snapshots
    WHERE token_address = NEW.token_address
      AND created_at < NEW.created_at
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- If still no price (this is the first snapshot), use launch price as baseline
  IF v_price_24h_ago IS NULL THEN
    SELECT launch_price_eth::numeric INTO v_launch_price
    FROM tokens
    WHERE token_address = NEW.token_address;

    IF v_launch_price IS NOT NULL AND v_launch_price > 0 THEN
      v_price_24h_ago := v_launch_price;
    END IF;
  END IF;

  -- Calculate price change percentage (should always succeed now)
  IF v_price_24h_ago IS NOT NULL AND v_price_24h_ago > 0 THEN
    v_price_change := ((v_current_price - v_price_24h_ago) / v_price_24h_ago) * 100;

    -- Update the tokens table with cached values
    UPDATE tokens
    SET
      price_24h_ago = v_price_24h_ago,
      price_change_24h = v_price_change,
      price_change_updated_at = NOW()
    WHERE token_address = NEW.token_address;
  END IF;

  RETURN NEW;
END;
$$;