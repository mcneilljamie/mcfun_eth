/*
  # Remove Excessive Duplicate Event Indexer Jobs
  
  1. Problem
    - There are 60 event-indexer jobs (event-indexer-1s-00 through event-indexer-1s-59)
    - All 60 jobs run every minute, overwhelming the system
    - This prevents ANY cron jobs from executing
    - All jobs fail with "job startup timeout"
  
  2. Solution
    - Remove all the duplicate event-indexer-1s-* jobs
    - Keep only the main index-lock-events job that runs every 2 seconds
    - This will allow the price-snapshot job to run successfully
  
  3. Impact
    - System will be able to execute cron jobs again
    - Charts will start updating
    - Lock events will still be indexed every 2 seconds
*/

-- Remove all the event-indexer-1s-* jobs
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname LIKE 'event-indexer-1s-%';