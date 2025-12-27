/*
  # Setup Burn Event Indexer Cron Job

  1. Purpose
    - Automatically index burn events (transfers to 0x0000...0000) from McFun tokens
    - Runs every 5 minutes to track token burns
    - Populates the token_burns table for leaderboard display

  2. Schedule
    - Runs every 5 minutes
    - Lightweight operation that tracks burns across all McFun tokens
*/

-- Drop any existing burn indexer cron jobs
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname LIKE '%burn%indexer%';

-- Create burn event indexer cron job (runs every 5 minutes)
SELECT cron.schedule(
  'burn-event-indexer-5min',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/burn-event-indexer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);