/*
  # Fix Cron Job URLs to Use Correct Supabase Instance

  1. Changes
    - Update index-lock-events-catchup to use hardcoded URL
    - Ensures cron jobs work without configuration parameters

  2. Configuration
    - Supabase URL: https://mulgpdxllortyotcdjqj.supabase.co
    - Uses service role key for authentication
*/

-- Recreate catchup job with hardcoded URL
DO $$
BEGIN
  -- Remove existing catchup job
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'index-lock-events-catchup') THEN
    PERFORM cron.unschedule('index-lock-events-catchup');
    RAISE NOTICE 'Removed existing index-lock-events-catchup job';
  END IF;
END $$;

-- Create new catchup job with correct URL
SELECT cron.schedule(
  'index-lock-events-catchup',
  '0 */4 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/lock-event-indexer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
      ),
      body := jsonb_build_object('catchup', true, 'force', true),
      timeout_milliseconds := 300000
    ) AS request_id;
  $$
);
