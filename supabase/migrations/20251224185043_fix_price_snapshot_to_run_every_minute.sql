/*
  # Fix Price Snapshot to Run Every Minute
  
  1. Problem
    - System has 60+ concurrent cron jobs causing severe overload
    - All cron jobs are failing with "job startup timeout"
    - The 30-second interval is too aggressive for the overloaded system
  
  2. Solution
    - Change to run once per minute (at the :00 second mark)
    - This reduces load and avoids conflicts with other jobs
    - Charts will still update in near-real-time (1-minute intervals)
  
  3. Impact
    - More reliable chart updates
    - Prevents job queue saturation
    - Still provides good user experience
*/

-- Drop the 30-second job
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'price-snapshot-30s';

-- Create new job that runs once per minute
SELECT cron.schedule(
  'price-snapshot-1min',
  '0 * * * * *',
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