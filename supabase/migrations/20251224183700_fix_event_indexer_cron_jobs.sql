/*
  # Fix Event Indexer Cron Jobs

  1. Purpose
    - Replace all failing event-indexer cron jobs with working ones
    - Use direct URLs instead of configuration parameters
  
  2. Changes
    - Drop all old event-indexer cron jobs
    - Create new cron jobs that run every second with hardcoded URLs
*/

-- Drop all existing event-indexer cron jobs
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname LIKE 'event-indexer-job-%';

-- Create 60 cron jobs that run every minute with staggered delays (every second)
DO $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 0..59 LOOP
    PERFORM cron.schedule(
      format('event-indexer-1s-%s', LPAD(i::TEXT, 2, '0')),
      '* * * * *',
      format(
        'SELECT pg_sleep(%s); SELECT net.http_post(url := ''https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer'', headers := jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', ''Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4''), body := ''''{}''''::jsonb, timeout_milliseconds := 30000);',
        i
      )
    );
  END LOOP;
END $$;
