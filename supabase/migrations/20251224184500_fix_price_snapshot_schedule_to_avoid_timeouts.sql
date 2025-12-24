/*
  # Fix Price Snapshot Schedule to Avoid Timeouts
  
  1. Problem
    - Cron jobs are failing with "job startup timeout"
    - The function takes 8+ seconds to run
    - Running every 15 seconds causes overlapping jobs
    - System has 60+ other cron jobs causing resource contention
  
  2. Solution
    - Change schedule from every 15 seconds to every 30 seconds
    - This gives the function enough time to complete before the next run
    - Increase HTTP timeout to 60 seconds to handle slower runs
  
  3. Impact
    - Charts will still update in near-real-time (30 second intervals)
    - Prevents job failures and gaps in price data
    - Reduces database load
*/

-- Drop the existing price-snapshot cron job
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'price-snapshot-15s';

-- Create new cron job with 30-second intervals and longer timeout
SELECT cron.schedule(
  'price-snapshot-30s',
  '*/30 * * * * *',
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