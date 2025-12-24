/*
  # Fix Price Snapshot Cron with Hardcoded URL

  1. Purpose
    - Create a working cron job that calls the price-snapshot edge function
    - Uses hardcoded URL since database settings can't be modified
  
  2. Changes
    - Drop old broken cron jobs and functions
    - Create new cron job with direct URL reference
*/

-- Drop any existing price-snapshot cron jobs
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname LIKE '%price-snapshot%' OR jobname LIKE '%call-price%';

-- Drop the old function
DROP FUNCTION IF EXISTS call_price_snapshot_edge();

-- Create a new cron job that directly calls the edge function via HTTP
SELECT cron.schedule(
  'price-snapshot-15s',
  '*/15 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/price-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);