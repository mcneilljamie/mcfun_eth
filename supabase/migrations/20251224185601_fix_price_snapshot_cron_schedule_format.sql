/*
  # Fix Price Snapshot Cron Schedule Format
  
  1. Problem
    - The job with schedule "0 * * * * *" (6-field format) is not executing
    - pg_cron may be using standard 5-field cron format on this system
  
  2. Solution
    - Change to standard cron format: "* * * * *" (every minute)
    - This is the most compatible format across all cron implementations
  
  3. Impact
    - Price snapshots will be created every minute
    - Charts will update reliably in real-time
*/

-- Drop the current job
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'price-snapshot-1min';

-- Create with standard 5-field cron format (every minute)
SELECT cron.schedule(
  'price-snapshot-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/price-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);