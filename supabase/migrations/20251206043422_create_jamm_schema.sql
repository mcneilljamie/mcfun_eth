/*
  # Create McFun Database Schema

  1. New Tables
    - `tokens`
      - `id` (uuid, primary key)
      - `token_address` (text, unique, indexed)
      - `amm_address` (text, unique, indexed)
      - `name` (text)
      - `symbol` (text)
      - `creator_address` (text)
      - `liquidity_percent` (integer)
      - `initial_liquidity_eth` (numeric)
      - `current_eth_reserve` (numeric)
      - `current_token_reserve` (numeric)
      - `total_volume_eth` (numeric, default 0)
      - `created_at` (timestamptz)

    - `swaps`
      - `id` (uuid, primary key)
      - `token_address` (text, foreign key)
      - `amm_address` (text)
      - `user_address` (text)
      - `eth_in` (numeric)
      - `token_in` (numeric)
      - `eth_out` (numeric)
      - `token_out` (numeric)
      - `tx_hash` (text)
      - `created_at` (timestamptz)

    - `price_snapshots`
      - `id` (uuid, primary key)
      - `token_address` (text, foreign key)
      - `price_eth` (numeric)
      - `eth_reserve` (numeric)
      - `token_reserve` (numeric)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Public read access for all data (no authentication required)
    - No write access from client (all writes via edge functions or indexer)
*/

-- Create tokens table
CREATE TABLE IF NOT EXISTS tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address text UNIQUE NOT NULL,
  amm_address text UNIQUE NOT NULL,
  name text NOT NULL,
  symbol text NOT NULL,
  creator_address text NOT NULL,
  liquidity_percent integer NOT NULL,
  initial_liquidity_eth numeric NOT NULL,
  current_eth_reserve numeric DEFAULT 0,
  current_token_reserve numeric DEFAULT 0,
  total_volume_eth numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create swaps table
CREATE TABLE IF NOT EXISTS swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address text NOT NULL,
  amm_address text NOT NULL,
  user_address text NOT NULL,
  eth_in numeric DEFAULT 0,
  token_in numeric DEFAULT 0,
  eth_out numeric DEFAULT 0,
  token_out numeric DEFAULT 0,
  tx_hash text,
  created_at timestamptz DEFAULT now()
);

-- Create price_snapshots table
CREATE TABLE IF NOT EXISTS price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address text NOT NULL,
  price_eth numeric NOT NULL,
  eth_reserve numeric NOT NULL,
  token_reserve numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tokens_address ON tokens(token_address);
CREATE INDEX IF NOT EXISTS idx_tokens_amm ON tokens(amm_address);
CREATE INDEX IF NOT EXISTS idx_tokens_created ON tokens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_liquidity ON tokens(current_eth_reserve DESC);
CREATE INDEX IF NOT EXISTS idx_swaps_token ON swaps(token_address);
CREATE INDEX IF NOT EXISTS idx_swaps_created ON swaps(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_token ON price_snapshots(token_address);
CREATE INDEX IF NOT EXISTS idx_price_created ON price_snapshots(created_at DESC);

-- Enable RLS
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Allow public read access to tokens"
  ON tokens FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated read access to tokens"
  ON tokens FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow public read access to swaps"
  ON swaps FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated read access to swaps"
  ON swaps FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow public read access to price_snapshots"
  ON price_snapshots FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated read access to price_snapshots"
  ON price_snapshots FOR SELECT
  TO authenticated
  USING (true);
