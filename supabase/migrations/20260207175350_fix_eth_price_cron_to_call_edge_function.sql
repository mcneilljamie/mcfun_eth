/*
  # Fix ETH Price Cron Job to Call Edge Function

  ## Summary
  The PostgreSQL function `track_eth_price()` using async HTTP calls has been unreliable,
  causing ETH price updates to stop for 1.5+ days. This migration switches the cron job
  to call the edge function directly via HTTP, which uses a synchronous approach proven to work.

  ## Changes
  1. Drop the existing cron job that calls the PostgreSQL function
  2. Create a new cron job that calls the edge function via net.http_post
  3. Use hardcoded URL and authentication (same pattern as event-indexer)

  ## Impact
  - Reliable ETH price updates every 5 minutes
  - No dependency on async HTTP response processing
  - Immediate feedback on success/failure
*/

-- Drop the old cron job that calls the PostgreSQL function
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'track-eth-price-5min') THEN
    PERFORM cron.unschedule('track-eth-price-5min');
    RAISE NOTICE 'Dropped old track-eth-price-5min cron job';
  END IF;
  
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'track-eth-price-edge-function') THEN
    PERFORM cron.unschedule('track-eth-price-edge-function');
    RAISE NOTICE 'Dropped old track-eth-price-edge-function cron job';
  END IF;
END $$;

-- Create new cron job that calls the edge function
SELECT cron.schedule(
  'track-eth-price-edge',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/track-eth-price',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )$$
);
