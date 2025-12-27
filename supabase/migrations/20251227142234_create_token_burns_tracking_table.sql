/*
  # Create Token Burns Tracking System

  1. New Tables
    - `token_burns`
      - `id` (bigint, primary key)
      - `token_address` (text, lowercase)
      - `burner_address` (text, lowercase) - Address that burned the tokens
      - `amount` (numeric) - Amount of tokens burned
      - `tx_hash` (text, unique) - Transaction hash
      - `block_number` (bigint) - Block number when burned
      - `timestamp` (timestamptz) - When the burn occurred
      - `eth_price_usd` (numeric) - ETH price at time of burn

  2. Security
    - Enable RLS on `token_burns` table
    - Add policy for anyone to read burn data (public leaderboard)
    - Add policy for authenticated users to insert burn records

  3. Indexes
    - token_address for filtering burns by token
    - burner_address for user burn history
    - block_number for indexing
    - timestamp for sorting
*/

-- Create token_burns table
CREATE TABLE IF NOT EXISTS token_burns (
  id bigserial PRIMARY KEY,
  token_address text NOT NULL,
  burner_address text NOT NULL,
  amount numeric NOT NULL,
  tx_hash text UNIQUE NOT NULL,
  block_number bigint NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  eth_price_usd numeric,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE token_burns ENABLE ROW LEVEL SECURITY;

-- Public read access for leaderboard
CREATE POLICY "Anyone can view burn data"
  ON token_burns FOR SELECT
  TO public
  USING (true);

-- Authenticated users can insert burns
CREATE POLICY "Authenticated users can insert burns"
  ON token_burns FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_token_burns_token_address ON token_burns(token_address);
CREATE INDEX IF NOT EXISTS idx_token_burns_burner_address ON token_burns(burner_address);
CREATE INDEX IF NOT EXISTS idx_token_burns_block_number ON token_burns(block_number);
CREATE INDEX IF NOT EXISTS idx_token_burns_timestamp ON token_burns(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_token_burns_tx_hash ON token_burns(tx_hash);

-- Add unique constraint to prevent duplicate burns
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_burns_unique ON token_burns(token_address, tx_hash);