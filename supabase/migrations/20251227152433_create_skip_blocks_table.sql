/*
  # Create skip blocks table for indexer error handling

  1. New Tables
    - `skip_blocks`
      - `id` (bigint, primary key, auto-increment)
      - `block_number` (bigint, unique) - Block number to skip
      - `reason` (text) - Why this block should be skipped
      - `indexer_type` (text) - Which indexer should skip it (burn, swap, lock, or 'all')
      - `created_at` (timestamptz) - When this skip rule was added
      - `created_by` (text) - Optional notes about who/what added this rule

  2. Security
    - Enable RLS on `skip_blocks` table
    - Add policy for authenticated users to read skip blocks
    - Add policy for service role to insert/update/delete skip blocks

  3. Indexes
    - Composite index on (block_number, indexer_type) for fast lookups
    - Index on indexer_type for filtering

  This table allows administrators to mark specific blocks that cause indexer errors
  and should be skipped during processing.
*/

CREATE TABLE IF NOT EXISTS skip_blocks (
  id bigserial PRIMARY KEY,
  block_number bigint NOT NULL,
  reason text DEFAULT '',
  indexer_type text NOT NULL DEFAULT 'all',
  created_at timestamptz DEFAULT now(),
  created_by text DEFAULT '',
  UNIQUE(block_number, indexer_type)
);

ALTER TABLE skip_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read skip blocks"
  ON skip_blocks FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert skip blocks"
  ON skip_blocks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update skip blocks"
  ON skip_blocks FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete skip blocks"
  ON skip_blocks FOR DELETE
  USING (true);

CREATE INDEX IF NOT EXISTS idx_skip_blocks_lookup 
  ON skip_blocks(block_number, indexer_type);

CREATE INDEX IF NOT EXISTS idx_skip_blocks_indexer_type 
  ON skip_blocks(indexer_type);
