/*
  # Create Base Chain Cron Jobs

  1. Changes
    - Add event-indexer cron job for Base chain (runs every 60 seconds)
    - Add lock-event-indexer cron job for Base chain (runs every 10 minutes)
    - Add burn-event-indexer cron job for Base chain (runs every 5 minutes)

  2. Configuration
    - Base chain ID: 8453
    - Same frequencies as Ethereum indexers for consistency
    - Uses chain_id query parameter to target specific chain

  3. Notes
    - Ethereum indexers remain unchanged
    - Base indexers run in parallel with Ethereum indexers
    - Each indexer maintains separate state per chain
*/

-- Create Base chain event indexer cron job (runs every minute)
SELECT cron.schedule(
  'base-event-indexer',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer?chain_id=8453',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"indexTokenLaunches": true, "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Create Base chain lock indexer cron job (runs every 10 minutes)
SELECT cron.schedule(
  'base-lock-indexer',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/lock-event-indexer?chain_id=8453',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    timeout_milliseconds := 290000
  );
  $$
);

-- Create Base chain burn indexer cron job (runs every 5 minutes)
SELECT cron.schedule(
  'base-burn-indexer',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/burn-event-indexer?chain_id=8453',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    timeout_milliseconds := 25000
  );
  $$
);

-- Update Ethereum indexers to explicitly use chain_id parameter for clarity
-- First drop the existing universal-indexer job
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'universal-indexer';

-- Recreate Ethereum event indexer with explicit chain_id
SELECT cron.schedule(
  'ethereum-event-indexer',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer?chain_id=1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"indexTokenLaunches": true, "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
