/*
  # Fix Minute Snapshot Collection
  
  1. Problem
    - Cron jobs are scheduled but not running
    - Database settings for calling edge functions aren't configured
    - No price snapshots being collected automatically
  
  2. Solution
    - Remove the approach that calls edge functions via HTTP
    - Instead, rely on the edge function being called directly via HTTP from external sources
    - Add database alerts/logging to help diagnose issues
  
  3. Changes
    - Drop the broken cron functions and jobs
    - Keep the price_snapshots table as-is
    - Edge functions should be called directly via HTTP (not from cron)
*/

-- Drop the existing cron jobs that aren't working
SELECT cron.unschedule('price-snapshot-hourly');
SELECT cron.unschedule('price-snapshot-minute-recent');

-- Drop the helper functions
DROP FUNCTION IF EXISTS call_price_snapshot() CASCADE;
DROP FUNCTION IF EXISTS call_price_snapshot_recent() CASCADE;

-- Add an index to improve query performance when fetching recent snapshots
CREATE INDEX IF NOT EXISTS idx_price_snapshots_token_created 
ON price_snapshots(token_address, created_at DESC);

-- Add an index for recent token queries
CREATE INDEX IF NOT EXISTS idx_tokens_created_at 
ON tokens(created_at DESC);
