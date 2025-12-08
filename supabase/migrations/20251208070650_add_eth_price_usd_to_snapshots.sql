/*
  # Add ETH Price USD to Price Snapshots

  1. Changes
    - Add `eth_price_usd` column to `price_snapshots` table
      - Stores the ETH/USD exchange rate at the time of snapshot
      - Allows accurate historical USD price calculations
      - Default value of 3000 for backward compatibility with existing snapshots

  2. Purpose
    - Preserve accurate historical USD prices
    - Prevent chart shifts when current ETH price changes
    - Enable accurate historical analysis
*/

-- Add eth_price_usd column to price_snapshots
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_snapshots' AND column_name = 'eth_price_usd'
  ) THEN
    ALTER TABLE price_snapshots ADD COLUMN eth_price_usd numeric DEFAULT 3000;
  END IF;
END $$;
