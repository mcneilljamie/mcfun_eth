/*
  # Auto-populate Launch ETH Price
  
  1. Changes
    - Create trigger to automatically set launch_eth_price_usd from first price snapshot
    - Ensures new tokens get the correct historical ETH price
    
  2. Purpose
    - Eliminates manual backfilling requirement
    - Makes 24h price calculations accurate from the start
*/

-- Function to set launch ETH price from first snapshot
CREATE OR REPLACE FUNCTION set_launch_eth_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_launch_eth_price NUMERIC;
BEGIN
  -- Check if this is the first snapshot for this token
  IF NOT EXISTS (
    SELECT 1 FROM price_snapshots
    WHERE token_address = NEW.token_address
    AND created_at < NEW.created_at
  ) THEN
    -- Get the token's current launch_eth_price_usd
    SELECT launch_eth_price_usd INTO v_token_launch_eth_price
    FROM tokens
    WHERE token_address = NEW.token_address;
    
    -- If it's null, update it with this snapshot's ETH price
    IF v_token_launch_eth_price IS NULL THEN
      UPDATE tokens
      SET launch_eth_price_usd = NEW.eth_price_usd
      WHERE token_address = NEW.token_address;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on price_snapshots
DROP TRIGGER IF EXISTS trigger_set_launch_eth_price ON price_snapshots;
CREATE TRIGGER trigger_set_launch_eth_price
  AFTER INSERT ON price_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION set_launch_eth_price();
