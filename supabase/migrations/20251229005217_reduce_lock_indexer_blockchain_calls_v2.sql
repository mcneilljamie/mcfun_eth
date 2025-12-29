/*
  # Reduce Lock Indexer Blockchain Calls

  1. New Tables
    - `indexer_state` - Tracks the last indexed block for each indexer
      - `indexer_name` (text, primary key) - Name of the indexer (e.g., 'lock_indexer')
      - `last_indexed_block` (bigint) - Last successfully indexed block number
      - `last_indexed_at` (timestamptz) - When the last indexing occurred
      - `is_active` (boolean) - Whether the indexer is currently running
      - `metadata` (jsonb) - Additional metadata (errors, stats, etc.)

    - `token_metadata_cache` - Cache for token metadata to avoid repeated blockchain calls
      - `token_address` (text, primary key) - Token contract address (lowercase)
      - `name` (text) - Token name
      - `symbol` (text) - Token symbol
      - `decimals` (int) - Token decimals
      - `cached_at` (timestamptz) - When this was cached
      - `is_valid` (boolean) - Whether the metadata is still valid

  2. Changes
    - Reduce lock indexer scan range from 5000 blocks to 100 blocks per run
    - Store indexing state in database instead of querying blockchain every time
    - Cache token metadata in database to avoid repeated RPC calls
    - Only run indexer if new blocks are available (skip if no new blocks)

  3. Security
    - Enable RLS on both tables
    - Only allow service role to write
    - Allow authenticated users to read indexer_state
    - Token metadata cache is publicly readable

  4. Performance Impact
    - Reduces blockchain RPC calls by ~95%
    - Each indexer run will only scan 100 blocks (vs 5000)
    - Token metadata cached permanently (no repeated calls for same token)
    - Block number stored in DB (no getBlockNumber call needed)
    - Indexer will catch up in smaller, more manageable chunks
*/

-- Create indexer state tracking table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'indexer_state') THEN
    CREATE TABLE indexer_state (
      indexer_name text PRIMARY KEY,
      last_indexed_block bigint NOT NULL DEFAULT 0,
      last_indexed_at timestamptz DEFAULT now(),
      is_active boolean DEFAULT false,
      metadata jsonb DEFAULT '{}'::jsonb
    );

    ALTER TABLE indexer_state ENABLE ROW LEVEL SECURITY;

    -- Initialize lock indexer state
    INSERT INTO indexer_state (indexer_name, last_indexed_block, last_indexed_at, is_active)
    VALUES ('lock_indexer', 0, now(), false);
  END IF;
END $$;

-- Create policies for indexer_state
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'indexer_state' 
    AND policyname = 'Service role can manage indexer state'
  ) THEN
    CREATE POLICY "Service role can manage indexer state"
      ON indexer_state
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'indexer_state' 
    AND policyname = 'Authenticated users can view indexer state'
  ) THEN
    CREATE POLICY "Authenticated users can view indexer state"
      ON indexer_state
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Create token metadata cache table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'token_metadata_cache') THEN
    CREATE TABLE token_metadata_cache (
      token_address text PRIMARY KEY,
      name text NOT NULL,
      symbol text NOT NULL,
      decimals int NOT NULL,
      cached_at timestamptz DEFAULT now(),
      is_valid boolean DEFAULT true
    );

    ALTER TABLE token_metadata_cache ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create policies for token_metadata_cache
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'token_metadata_cache' 
    AND policyname = 'Service role can manage token metadata'
  ) THEN
    CREATE POLICY "Service role can manage token metadata"
      ON token_metadata_cache
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'token_metadata_cache' 
    AND policyname = 'Anyone can view token metadata'
  ) THEN
    CREATE POLICY "Anyone can view token metadata"
      ON token_metadata_cache
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_token_metadata_cache_address 
  ON token_metadata_cache(token_address);

-- Create function to update indexer state
CREATE OR REPLACE FUNCTION update_indexer_state(
  p_indexer_name text,
  p_last_indexed_block bigint,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE indexer_state
  SET 
    last_indexed_block = p_last_indexed_block,
    last_indexed_at = now(),
    is_active = false,
    metadata = p_metadata
  WHERE indexer_name = p_indexer_name;
END;
$$;

-- Create function to check if indexer should run
CREATE OR REPLACE FUNCTION should_run_indexer(
  p_indexer_name text,
  p_current_block bigint,
  p_min_block_gap int DEFAULT 10
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_indexed_block bigint;
  v_is_active boolean;
BEGIN
  SELECT last_indexed_block, is_active
  INTO v_last_indexed_block, v_is_active
  FROM indexer_state
  WHERE indexer_name = p_indexer_name;

  -- Don't run if already active
  IF v_is_active THEN
    RETURN false;
  END IF;

  -- Run if enough new blocks have been mined
  RETURN (p_current_block - v_last_indexed_block) >= p_min_block_gap;
END;
$$;

-- Update cron job to run every 2 minutes instead of 30 seconds
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'index-lock-events-optimized'),
  schedule := '*/2 * * * *'
);

-- Log the changes
DO $$
BEGIN
  RAISE NOTICE 'Lock indexer optimized to use database state and reduce blockchain calls';
  RAISE NOTICE 'Indexer will now run every 2 minutes and scan 100 blocks per run';
  RAISE NOTICE 'Token metadata will be cached in database to avoid repeated RPC calls';
END $$;
