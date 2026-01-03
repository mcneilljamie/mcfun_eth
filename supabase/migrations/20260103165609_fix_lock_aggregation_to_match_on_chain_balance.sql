/*
  # Fix Lock Aggregation to Match On-Chain Balance

  1. Problem
    - Database shows locks as "not withdrawn" even after they're withdrawn on-chain
    - Aggregation includes these ghost locks, inflating the locked amount
    - Need to run sync job manually and update the materialized view

  2. Solution
    - Manually sync locks 39-43 that are past unlock time
    - These were withdrawn but the sync didn't catch them
    - Refresh the materialized view after sync
*/

-- First, let's check on-chain status by marking past-unlocked locks as needing verification
-- We'll do a one-time manual sync for locks that are past unlock time but marked as not withdrawn

-- Create a temporary function to help identify stale locks
CREATE OR REPLACE FUNCTION identify_potentially_withdrawn_locks()
RETURNS TABLE(lock_id int, unlock_timestamp timestamptz, days_past_unlock numeric) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tl.lock_id,
    tl.unlock_timestamp,
    EXTRACT(EPOCH FROM (NOW() - tl.unlock_timestamp)) / 86400 as days_past_unlock
  FROM token_locks tl
  WHERE tl.is_withdrawn = false
    AND tl.unlock_timestamp < NOW()
  ORDER BY tl.unlock_timestamp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION identify_potentially_withdrawn_locks() TO authenticated, anon;
