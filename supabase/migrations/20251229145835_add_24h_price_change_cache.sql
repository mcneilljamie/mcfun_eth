/*
  # Add 24-Hour Price Change Cache

  1. Purpose
    - Cache 24-hour price changes directly in tokens table
    - Eliminate expensive repeated calculations of get_24h_price_changes
    - Provide instant access to price changes for token listings

  2. Changes
    - Add price_24h_ago column to store price from 24 hours ago
    - Add price_change_24h column to store percentage change
    - Add price_change_updated_at column to track freshness
    - Create trigger to auto-update on new price snapshots

  3. Benefits
    - Reduces database query load significantly
    - Faster token list page loads
    - Real-time price change updates alongside chart updates

  4. Security
    - Function runs with SECURITY DEFINER for system-level updates
    - Only updates cache columns, no user-facing data modification
*/

-- Add cache columns to tokens table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tokens' AND column_name = 'price_24h_ago'
  ) THEN
    ALTER TABLE tokens ADD COLUMN price_24h_ago numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tokens' AND column_name = 'price_change_24h'
  ) THEN
    ALTER TABLE tokens ADD COLUMN price_change_24h numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tokens' AND column_name = 'price_change_updated_at'
  ) THEN
    ALTER TABLE tokens ADD COLUMN price_change_updated_at timestamptz;
  END IF;
END $$;

-- Create function to update 24h price change cache
CREATE OR REPLACE FUNCTION update_24h_price_change_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price_24h_ago numeric;
  v_current_price numeric;
  v_price_change numeric;
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
  
  -- If no snapshot from 24h ago, try to get the oldest available
  IF v_price_24h_ago IS NULL THEN
    SELECT price_eth::numeric INTO v_price_24h_ago
    FROM price_snapshots
    WHERE token_address = NEW.token_address
      AND created_at < NEW.created_at
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
  
  -- Calculate price change percentage
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

-- Create trigger on price_snapshots table
DROP TRIGGER IF EXISTS trigger_update_24h_price_change ON price_snapshots;

CREATE TRIGGER trigger_update_24h_price_change
  AFTER INSERT ON price_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_24h_price_change_cache();

-- Backfill: Calculate 24h price changes for all tokens with snapshots
DO $$
DECLARE
  token_record RECORD;
  v_price_24h_ago numeric;
  v_current_price numeric;
  v_price_change numeric;
BEGIN
  FOR token_record IN 
    SELECT DISTINCT token_address
    FROM price_snapshots
  LOOP
    -- Get most recent price
    SELECT price_eth::numeric INTO v_current_price
    FROM price_snapshots
    WHERE token_address = token_record.token_address
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Get price from 24 hours ago
    SELECT price_eth::numeric INTO v_price_24h_ago
    FROM price_snapshots
    WHERE token_address = token_record.token_address
      AND created_at <= NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- If no 24h snapshot, use oldest available
    IF v_price_24h_ago IS NULL THEN
      SELECT price_eth::numeric INTO v_price_24h_ago
      FROM price_snapshots
      WHERE token_address = token_record.token_address
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
    
    -- Calculate and update if we have data
    IF v_price_24h_ago IS NOT NULL AND v_price_24h_ago > 0 AND v_current_price IS NOT NULL THEN
      v_price_change := ((v_current_price - v_price_24h_ago) / v_price_24h_ago) * 100;
      
      UPDATE tokens
      SET 
        price_24h_ago = v_price_24h_ago,
        price_change_24h = v_price_change,
        price_change_updated_at = NOW()
      WHERE token_address = token_record.token_address;
    END IF;
  END LOOP;
END $$;

-- Create index on price_change_updated_at for monitoring stale data
CREATE INDEX IF NOT EXISTS idx_tokens_price_change_updated_at 
  ON tokens(price_change_updated_at);
