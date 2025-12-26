/*
  # Fix Event Indexer Cron Jobs with Proper Configuration

  1. Changes
    - Remove the broken 10-second cron jobs that rely on missing settings
    - Create a single working cron job with hardcoded configuration
    - Job runs every 10 seconds (via 6 staggered jobs per minute)

  2. Implementation
    - 6 jobs run every minute with 0, 10, 20, 30, 40, 50 second delays
    - Uses direct URL and key (same pattern as old event-indexer-main)
    - More reliable than relying on database settings
*/

-- Remove the broken 10-second jobs
DO $$
DECLARE
  i INTEGER;
  job_name TEXT;
BEGIN
  FOR i IN 0..5 LOOP
    job_name := 'event-indexer-10s-' || i::TEXT;
    BEGIN
      PERFORM cron.unschedule(job_name);
      RAISE NOTICE 'Dropped job: %', job_name;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Job % does not exist', job_name;
    END;
  END LOOP;
END $$;

-- Create 6 new jobs that actually work
SELECT cron.schedule(
  'event-indexer-10s-v2-0',
  '* * * * *',
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

SELECT cron.schedule(
  'event-indexer-10s-v2-1',
  '* * * * *',
  $$
  SELECT pg_sleep(10);
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

SELECT cron.schedule(
  'event-indexer-10s-v2-2',
  '* * * * *',
  $$
  SELECT pg_sleep(20);
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

SELECT cron.schedule(
  'event-indexer-10s-v2-3',
  '* * * * *',
  $$
  SELECT pg_sleep(30);
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

SELECT cron.schedule(
  'event-indexer-10s-v2-4',
  '* * * * *',
  $$
  SELECT pg_sleep(40);
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

SELECT cron.schedule(
  'event-indexer-10s-v2-5',
  '* * * * *',
  $$
  SELECT pg_sleep(50);
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
