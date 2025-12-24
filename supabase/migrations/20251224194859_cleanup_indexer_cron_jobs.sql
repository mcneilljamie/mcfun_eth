/*
  # Cleanup Indexer Cron Jobs

  1. Purpose
    - Ensure only ONE event-indexer cron job is running
    - Remove all duplicate/legacy event-indexer jobs
    - Keep only the lock-event-indexer job (every 2 seconds)
    - Add a new efficient event-indexer job (every 5 seconds)

  2. Changes
    - Drop all event-indexer-* jobs (60 duplicate jobs)
    - Create single optimized event-indexer job
    - Preserve lock-event-indexer job

  3. Impact
    - Prevents system overload from duplicate jobs
    - Ensures cron jobs can execute properly
    - Maintains proper indexing frequency
*/

-- Drop all legacy event-indexer jobs
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname LIKE 'event-indexer-%';

-- Create single optimized event-indexer job (every 5 seconds)
SELECT cron.schedule(
  'event-indexer-main',
  '*/5 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
