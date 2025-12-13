/*
  # Increase Event Indexer to Every 1 Second for Instantaneous Updates

  1. Changes
    - Drop all existing 5-second interval cron jobs
    - Create cron jobs that run every 1 second instead of every 5 seconds
    - This provides near-instantaneous updates for recent trades

  2. Implementation
    - Create 60 separate cron jobs with staggered delays (0-59 seconds)
    - Each job runs every minute but with a different delay
    - Effectively provides 1-second granularity for event indexing

  3. Benefits
    - Recent trades appear within 1-2 seconds of being confirmed on-chain
    - Much better user experience with nearly real-time trade updates
    - Combined with realtime subscriptions, provides instantaneous UI updates
*/

-- Drop all existing 5-second interval jobs
SELECT cron.unschedule('event-indexer-job-00');
SELECT cron.unschedule('event-indexer-job-05');
SELECT cron.unschedule('event-indexer-job-10');
SELECT cron.unschedule('event-indexer-job-15');
SELECT cron.unschedule('event-indexer-job-20');
SELECT cron.unschedule('event-indexer-job-25');
SELECT cron.unschedule('event-indexer-job-30');
SELECT cron.unschedule('event-indexer-job-35');
SELECT cron.unschedule('event-indexer-job-40');
SELECT cron.unschedule('event-indexer-job-45');
SELECT cron.unschedule('event-indexer-job-50');
SELECT cron.unschedule('event-indexer-job-55');

-- Create jobs for every second (0-59)
-- Using DO block to avoid repetition
DO $$
DECLARE
  i INTEGER;
  job_command TEXT;
BEGIN
  FOR i IN 0..59 LOOP
    job_command := 'SELECT pg_sleep(' || i::TEXT || '); ' ||
                   'SELECT net.http_post(' ||
                   'url := (SELECT current_setting(''app.settings.supabase_url'') || ''/functions/v1/event-indexer''), ' ||
                   'headers := jsonb_build_object(' ||
                   '''Content-Type'', ''application/json'', ' ||
                   '''Authorization'', ''Bearer '' || (SELECT current_setting(''app.settings.supabase_service_role_key''))' ||
                   '), ' ||
                   'body := ''{}''::jsonb' ||
                   ');';
    
    PERFORM cron.schedule(
      'event-indexer-job-' || LPAD(i::TEXT, 2, '0'),
      '* * * * *',
      job_command
    );
  END LOOP;
END $$;
