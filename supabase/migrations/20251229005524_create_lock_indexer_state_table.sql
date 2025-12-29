/*
  # Create Lock Indexer State Table

  1. New Tables
    - `lock_indexer_state` - Dedicated state tracking for lock indexer
      - `indexer_name` (text, primary key) - Name of the indexer (always 'lock_indexer')
      - `last_indexed_block` (bigint) - Last successfully indexed block number
      - `last_indexed_at` (timestamptz) - When the last indexing occurred
      - `is_active` (boolean) - Whether the indexer is currently running
      - `metadata` (jsonb) - Additional metadata (errors, stats, etc.)

  2. Security
    - Enable RLS
    - Service role can manage
    - Authenticated users can view

  3. Purpose
    - Avoid conflicts with existing indexer_state table (used for swap events)
    - Track lock indexer progress separately
    - Store state in database to reduce blockchain calls
*/

CREATE TABLE IF NOT EXISTS lock_indexer_state (
  indexer_name text PRIMARY KEY,
  last_indexed_block bigint NOT NULL DEFAULT 0,
  last_indexed_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE lock_indexer_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage lock indexer state"
  ON lock_indexer_state
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can view lock indexer state"
  ON lock_indexer_state
  FOR SELECT
  TO authenticated
  USING (true);

-- Initialize with current max block from token_locks
INSERT INTO lock_indexer_state (indexer_name, last_indexed_block, last_indexed_at, is_active)
VALUES (
  'lock_indexer',
  COALESCE((SELECT MAX(block_number) FROM token_locks), 7413490),
  now(),
  false
);

-- Log the initialization
DO $$
DECLARE
  v_current_block bigint;
BEGIN
  SELECT last_indexed_block INTO v_current_block
  FROM lock_indexer_state
  WHERE indexer_name = 'lock_indexer';
  
  RAISE NOTICE 'Lock indexer state initialized at block %', v_current_block;
END $$;
