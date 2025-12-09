/*
  # Create ETH Price History Table

  ## Summary
  Creates a table to store historical Ethereum prices in USD from CoinGecko API.
  This table serves as a reference for accurate historical ETH prices to calculate
  token USD values from their ETH prices at any point in time.

  ## Changes
  1. New Tables
    - `eth_price_history`
      - `timestamp` (timestamptz, primary key): Time of the price record
      - `price_usd` (numeric): ETH price in USD at this timestamp
      - `created_at` (timestamptz): When this record was created in our system

  2. Indexes
    - Primary index on `timestamp` for fast lookups by time
    - Additional index on `created_at` for administrative queries

  3. Security
    - Enable RLS on `eth_price_history` table
    - Add public read policy (anyone can read ETH prices)
    - Add service role insert policy (only system can insert prices)

  ## Notes
  - This table will be populated by:
    1. One-time backfill of historical data from CoinGecko
    2. Continuous updates every minute from CoinGecko API
  - Timestamps are stored in UTC
  - Price is stored as numeric for precision
*/

-- Create eth_price_history table
CREATE TABLE IF NOT EXISTS eth_price_history (
  timestamp timestamptz PRIMARY KEY,
  price_usd numeric NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add index on created_at for administrative queries
CREATE INDEX IF NOT EXISTS idx_eth_price_history_created_at 
  ON eth_price_history(created_at DESC);

-- Enable RLS
ALTER TABLE eth_price_history ENABLE ROW LEVEL SECURITY;

-- Public read policy: anyone can read ETH prices
CREATE POLICY "Anyone can read ETH price history"
  ON eth_price_history
  FOR SELECT
  TO public
  USING (true);

-- Insert policy: only service role can insert
CREATE POLICY "Service role can insert ETH prices"
  ON eth_price_history
  FOR INSERT
  TO service_role
  WITH CHECK (true);