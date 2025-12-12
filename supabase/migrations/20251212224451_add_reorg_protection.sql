/*
  # Add Chain Reorganization Protection

  1. Changes to Existing Tables
    - Add `block_number` (bigint) to tokens, swaps, and price_snapshots
    - Add `block_hash` (text) to tokens and swaps for reorg detection
    - Add indexes for efficient block-based queries

  2. New Tables
    - `indexer_state`
      - `id` (uuid, primary key)
      - `last_indexed_block` (bigint) - Last block that was safely indexed
      - `last_block_hash` (text) - Hash of the last indexed block for reorg detection
      - `confirmation_depth` (integer) - Number of blocks to wait before considering finalized
      - `updated_at` (timestamptz)

  3. Important Notes
    - Block numbers and hashes enable detection of chain reorganizations
    - Confirmation depth ensures we only index blocks unlikely to be reorged
    - Indexer state allows the system to resume from the last safe point
    - This prevents duplicate or incorrect data from invalidated blocks

  4. Security
    - Enable RLS on indexer_state table
    - Public read access for indexer_state
    - No write access from client
*/

-- Add block tracking columns to existing tables
DO $$
BEGIN
  -- Add to tokens table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tokens' AND column_name = 'block_number'
  ) THEN
    ALTER TABLE tokens ADD COLUMN block_number bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tokens' AND column_name = 'block_hash'
  ) THEN
    ALTER TABLE tokens ADD COLUMN block_hash text;
  END IF;

  -- Add to swaps table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'swaps' AND column_name = 'block_number'
  ) THEN
    ALTER TABLE swaps ADD COLUMN block_number bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'swaps' AND column_name = 'block_hash'
  ) THEN
    ALTER TABLE swaps ADD COLUMN block_hash text;
  END IF;

  -- Add to price_snapshots table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_snapshots' AND column_name = 'block_number'
  ) THEN
    ALTER TABLE price_snapshots ADD COLUMN block_number bigint;
  END IF;
END $$;

-- Create indexer state tracking table
CREATE TABLE IF NOT EXISTS indexer_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_indexed_block bigint NOT NULL DEFAULT 0,
  last_block_hash text,
  confirmation_depth integer NOT NULL DEFAULT 12,
  updated_at timestamptz DEFAULT now()
);

-- Insert initial state if table is empty
INSERT INTO indexer_state (last_indexed_block, confirmation_depth)
SELECT 0, 12
WHERE NOT EXISTS (SELECT 1 FROM indexer_state);

-- Create indexes for block-based queries
CREATE INDEX IF NOT EXISTS idx_tokens_block_number ON tokens(block_number DESC);
CREATE INDEX IF NOT EXISTS idx_swaps_block_number ON swaps(block_number DESC);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_block_number ON price_snapshots(block_number DESC);

-- Create composite indexes for efficient reorg rollback
CREATE INDEX IF NOT EXISTS idx_tokens_block_hash ON tokens(block_hash);
CREATE INDEX IF NOT EXISTS idx_swaps_block_hash ON swaps(block_hash);

-- Enable RLS on indexer_state
ALTER TABLE indexer_state ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access to indexer_state
CREATE POLICY "Allow public read access to indexer_state"
  ON indexer_state FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated read access to indexer_state"
  ON indexer_state FOR SELECT
  TO authenticated
  USING (true);