/*
# Speed Up Event Indexers to 2-Minute Intervals

New trades were taking up to 15 minutes to appear on the site because the
event indexers were running every 15 minutes. The previous database overload
was caused by having 17 concurrent jobs, not by having 2 jobs at a moderate
frequency. Two event indexers at 2 minutes is safe and sustainable.

Only the event indexers change. Lock/burn indexers stay at 45 min, ETH price
tracking stays at 30 min.
*/

-- Unschedule existing event indexers so we can reschedule them
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ethereum-event-indexer';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'base-event-indexer';

-- Ethereum event indexer: every 2 minutes
SELECT cron.schedule(
  'ethereum-event-indexer',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer?chain_id=1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"indexTokenLaunches": true, "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Base event indexer: every 2 minutes
SELECT cron.schedule(
  'base-event-indexer',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer?chain_id=8453',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"indexTokenLaunches": true, "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
