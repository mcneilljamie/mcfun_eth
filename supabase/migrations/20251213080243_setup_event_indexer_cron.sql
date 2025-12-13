/*
  # Setup Event Indexer Cron Job

  1. Changes
    - Create a cron job to run the event-indexer every minute
    - This ensures new swaps and token launches are indexed from the blockchain automatically
    - Creates indexer_state table if it doesn't exist to track indexing progress
  
  2. Benefits
    - Automatic detection and indexing of new blockchain events
    - Recent trades will appear within 1 minute of being mined
    - No manual intervention needed
*/

-- Create indexer_state table if it doesn't exist
CREATE TABLE IF NOT EXISTS indexer_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_indexed_block bigint DEFAULT 0,
  last_block_hash text,
  confirmation_depth int DEFAULT 12,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE indexer_state ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'indexer_state' 
    AND policyname = 'Allow public read access to indexer state'
  ) THEN
    CREATE POLICY "Allow public read access to indexer state"
      ON indexer_state
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Insert initial state if table is empty
INSERT INTO indexer_state (last_indexed_block, confirmation_depth)
SELECT 0, 12
WHERE NOT EXISTS (SELECT 1 FROM indexer_state);

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any existing event-indexer jobs
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'event-indexer-job';

-- Schedule event-indexer to run every minute
SELECT cron.schedule(
  'event-indexer-job',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);
