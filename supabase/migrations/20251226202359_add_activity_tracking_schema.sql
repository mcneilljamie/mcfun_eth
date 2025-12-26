/*
  # Add Activity Tracking Schema for Scalable Indexing

  1. New Columns on tokens table
    - `last_swap_at` (timestamptz) - When the last swap occurred
    - `swap_count_24h` (integer) - Number of swaps in last 24 hours
    - `last_checked_block` (bigint) - Last block number checked for this token
    - `activity_tier` (text) - Current activity tier (hot/warm/cold/dormant)
    - `last_tier_update` (timestamptz) - When tier was last calculated

  2. New Tables
    - `indexer_metrics` - Track indexer performance over time
      - `id` (uuid, primary key)
      - `run_type` (text) - Type of indexer run (hot/warm/cold)
      - `tokens_processed` (integer) - Number of tokens checked
      - `blocks_scanned` (integer) - Number of blocks scanned
      - `swaps_found` (integer) - Number of new swaps indexed
      - `rpc_calls_made` (integer) - Total RPC calls
      - `processing_time_ms` (integer) - Time taken in milliseconds
      - `errors_count` (integer) - Number of errors encountered
      - `created_at` (timestamptz)

  3. Indexes
    - Composite index on (activity_tier, last_swap_at) for tier queries
    - Index on last_checked_block for quick lookups
    - Index on last_tier_update for tier recalculation

  4. Security
    - Enable RLS on indexer_metrics
    - Public read access for transparency
*/

-- Add activity tracking columns to tokens table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tokens' AND column_name = 'last_swap_at'
  ) THEN
    ALTER TABLE tokens ADD COLUMN last_swap_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tokens' AND column_name = 'swap_count_24h'
  ) THEN
    ALTER TABLE tokens ADD COLUMN swap_count_24h integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tokens' AND column_name = 'last_checked_block'
  ) THEN
    ALTER TABLE tokens ADD COLUMN last_checked_block bigint DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tokens' AND column_name = 'activity_tier'
  ) THEN
    ALTER TABLE tokens ADD COLUMN activity_tier text DEFAULT 'dormant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tokens' AND column_name = 'last_tier_update'
  ) THEN
    ALTER TABLE tokens ADD COLUMN last_tier_update timestamptz DEFAULT now();
  END IF;
END $$;

-- Create indexer_metrics table
CREATE TABLE IF NOT EXISTS indexer_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL,
  tokens_processed integer DEFAULT 0,
  blocks_scanned integer DEFAULT 0,
  swaps_found integer DEFAULT 0,
  rpc_calls_made integer DEFAULT 0,
  processing_time_ms integer DEFAULT 0,
  errors_count integer DEFAULT 0,
  error_details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for efficient activity-based queries
CREATE INDEX IF NOT EXISTS idx_tokens_activity_tier_swap ON tokens(activity_tier, last_swap_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tokens_last_checked_block ON tokens(last_checked_block);
CREATE INDEX IF NOT EXISTS idx_tokens_last_tier_update ON tokens(last_tier_update);
CREATE INDEX IF NOT EXISTS idx_tokens_swap_count_24h ON tokens(swap_count_24h DESC);
CREATE INDEX IF NOT EXISTS idx_indexer_metrics_created ON indexer_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_indexer_metrics_run_type ON indexer_metrics(run_type, created_at DESC);

-- Enable RLS on indexer_metrics
ALTER TABLE indexer_metrics ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access to metrics
CREATE POLICY "Allow public read access to indexer metrics"
  ON indexer_metrics FOR SELECT
  TO anon, authenticated
  USING (true);

-- Initialize last_swap_at for existing tokens based on their most recent swap
UPDATE tokens
SET last_swap_at = (
  SELECT MAX(created_at)
  FROM swaps
  WHERE swaps.token_address = tokens.token_address
)
WHERE last_swap_at IS NULL;

-- Initialize swap_count_24h for existing tokens
UPDATE tokens
SET swap_count_24h = (
  SELECT COUNT(*)
  FROM swaps
  WHERE swaps.token_address = tokens.token_address
    AND swaps.created_at > now() - interval '24 hours'
)
WHERE swap_count_24h = 0;