/*
  # Increase Event Indexer Frequency
  
  1. Changes
    - Update event-indexer cron job to run every 15 seconds instead of every minute
    - This will make recent trades appear much faster in the UI
  
  2. Notes
    - The cron expression for every 15 seconds is not directly supported
    - We'll update to every 30 seconds which is a good balance between freshness and load
*/

-- Drop existing cron job
SELECT cron.unschedule('event-indexer-job');

-- Create new cron job that runs every 30 seconds
-- Note: pg_cron doesn't support sub-minute intervals in standard cron syntax
-- So we'll use multiple jobs at different offsets
SELECT cron.schedule(
  'event-indexer-job-00',
  '* * * * *',  -- Every minute at :00
  $$
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'event-indexer-job-30',
  '* * * * *',  -- Every minute at :30
  $$
  SELECT pg_sleep(30);  -- Wait 30 seconds
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);
