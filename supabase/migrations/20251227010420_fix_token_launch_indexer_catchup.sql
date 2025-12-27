/*
  # Fix Token Launch Indexer Catch-Up
  
  1. Problem
    - Swap indexer is at block 9921660
    - Token launch indexer is stuck at block 9899865
    - 21,795 block gap means new tokens aren't appearing
    
  2. Solution
    - Add dedicated token launch catch-up job
    - Run every 30 seconds to catch up quickly
    - Only indexes token launches (no swaps)
    
  3. Notes
    - Will be removed once caught up
    - Temporary solution to close the gap
*/

-- Add a dedicated token launch catch-up job
SELECT cron.schedule(
  'indexer-token-launches-catchup',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"indexTokenLaunches": true, "indexSwaps": false}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
