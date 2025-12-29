/*
  # Fix Lock Indexer Catchup URL

  1. Changes
    - Update lock-indexer-catchup cron job to use correct Supabase URL
    - Previous URL (ymglqvhgkmexdvnxdpzs) was from old project
    - Correct URL (mulgpdxllortyotcdjqj) matches current instance

  2. Impact
    - Catchup job will now run successfully every 6 hours
    - Will close any gaps in lock event indexing
    - Ensures no locks are missed
*/

-- Drop old catchup job with wrong URL
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lock-indexer-catchup') THEN
    PERFORM cron.unschedule((SELECT jobid FROM cron.job WHERE jobname = 'lock-indexer-catchup'));
    RAISE NOTICE 'Dropped old lock-indexer-catchup job with incorrect URL';
  END IF;
END $$;

-- Create new catchup cron job with correct URL
SELECT cron.schedule(
  'lock-indexer-catchup',
  '0 */6 * * *', -- Every 6 hours at minute 0
  $$
  SELECT
    net.http_post(
      url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/lock-event-indexer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
      ),
      body := jsonb_build_object('catchup', true),
      timeout_milliseconds := 300000
    ) AS request_id;
  $$
);