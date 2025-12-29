/*
  # Add Instant Tier Promotion on Swaps

  1. Purpose
    - Immediately promote tokens to HOT tier when new swaps are detected
    - Eliminates 5-minute delay from periodic tier update cron job
    - Ensures actively traded tokens get indexed every 10 seconds

  2. Changes
    - Create trigger function that updates activity_tier to 'hot'
    - Create trigger on swaps table AFTER INSERT
    - Update last_swap_at and activity_tier columns

  3. Benefits
    - Zero additional RPC calls (pure database logic)
    - Instant responsiveness for newly active tokens
    - Chart updates within 10 seconds instead of up to 10 minutes

  4. Security
    - Function runs with SECURITY DEFINER for system-level updates
    - Only updates activity tracking columns, no data modification
*/

-- Create function to instantly promote token to HOT tier on swap
CREATE OR REPLACE FUNCTION promote_token_to_hot_on_swap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update the token's activity tier to HOT and record swap timestamp
  UPDATE tokens
  SET 
    activity_tier = 'hot',
    last_swap_at = NEW.created_at,
    last_tier_update = NOW()
  WHERE token_address = NEW.token_address;
  
  RETURN NEW;
END;
$$;

-- Create trigger on swaps table
DROP TRIGGER IF EXISTS trigger_promote_to_hot_on_swap ON swaps;

CREATE TRIGGER trigger_promote_to_hot_on_swap
  AFTER INSERT ON swaps
  FOR EACH ROW
  EXECUTE FUNCTION promote_token_to_hot_on_swap();

-- Backfill: Set any tokens with recent swaps (last 5 minutes) to HOT tier
UPDATE tokens
SET 
  activity_tier = 'hot',
  last_tier_update = NOW()
WHERE token_address IN (
  SELECT DISTINCT token_address
  FROM swaps
  WHERE created_at > NOW() - INTERVAL '5 minutes'
)
AND (activity_tier IS NULL OR activity_tier != 'hot');
