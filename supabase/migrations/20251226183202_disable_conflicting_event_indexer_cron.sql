/*
  # Disable Conflicting Event Indexer Cron Job

  1. Changes
    - Unschedule the old event-indexer-main cron job
    - This job conflicts with the new 10-second staggered jobs
    - Prevents duplicate indexing attempts

  2. Rationale
    - Only the new 10-second staggered jobs should run
    - The old job uses hardcoded credentials which is less secure
*/

-- Try to unschedule the old event-indexer-main job
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('event-indexer-main');
    RAISE NOTICE 'Unscheduled event-indexer-main job successfully';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'event-indexer-main job does not exist or was already unscheduled';
  END;
END $$;
