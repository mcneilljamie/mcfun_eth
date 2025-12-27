/*
  # Fix Burn Event Indexer Cron Job

  1. Changes
    - Remove the broken burn event indexer cron job that relies on missing settings
    - Create a new working cron job with hardcoded configuration
    - Job runs every 5 minutes to track token burns

  2. Implementation
    - Uses direct URL and key (same pattern as event-indexer)
    - More reliable than relying on database settings
*/

-- Remove the broken burn indexer cron job
SELECT cron.unschedule('burn-event-indexer-5min');

-- Create new working burn event indexer cron job (runs every 5 minutes)
SELECT cron.schedule(
  'burn-event-indexer-5min-v2',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/burn-event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
