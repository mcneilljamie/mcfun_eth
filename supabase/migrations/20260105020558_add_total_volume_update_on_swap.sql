/*
  # Add Total Volume Tracking to Swap Trigger

  1. Changes
    - Updates `promote_token_to_hot_on_swap` function to also update `total_volume_eth`
    - Adds both ETH in and ETH out to the total volume on each swap
    - Backfills existing tokens with correct total_volume_eth

  2. Security
    - Maintains existing SECURITY DEFINER
    - No new permissions required
*/

-- Update the function to also track total volume
CREATE OR REPLACE FUNCTION promote_token_to_hot_on_swap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update the token's activity tier, swap timestamp, and total volume
  UPDATE tokens
  SET 
    activity_tier = 'hot',
    last_swap_at = NEW.created_at,
    last_tier_update = NOW(),
    total_volume_eth = COALESCE(total_volume_eth, 0) + CAST(NEW.eth_in AS NUMERIC) + CAST(NEW.eth_out AS NUMERIC)
  WHERE token_address = NEW.token_address;
  
  RETURN NEW;
END;
$$;

-- Backfill total_volume_eth for all tokens
UPDATE tokens
SET total_volume_eth = COALESCE((
  SELECT SUM(CAST(eth_in AS NUMERIC) + CAST(eth_out AS NUMERIC))
  FROM swaps
  WHERE swaps.token_address = tokens.token_address
), 0)
WHERE total_volume_eth = 0 OR total_volume_eth IS NULL;