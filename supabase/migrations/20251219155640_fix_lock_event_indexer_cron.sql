/*
  # Fix Lock Event Indexer Cron Job

  1. Purpose
    - Fix the failing cron job that indexes lock events
    - Use hardcoded Supabase URL instead of configuration parameters
    - Increase frequency to every 2 seconds for faster updates

  2. Changes
    - Drop existing broken cron job
    - Create new cron job with hardcoded URL and credentials
    - Schedule to run every 2 seconds

  3. Security
    - Uses proper authentication headers
*/

-- Drop existing broken cron job
SELECT cron.unschedule('index-lock-events');

-- Create new cron job with hardcoded values (runs every 2 seconds)
SELECT cron.schedule(
  'index-lock-events',
  '*/2 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/lock-event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    )
  );
  $$
);
