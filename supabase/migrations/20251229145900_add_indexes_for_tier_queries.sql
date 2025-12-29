/*
  # Add Indexes for Tier Query Optimization

  1. Purpose
    - Speed up tier classification queries
    - Optimize get_tokens_by_tier function performance
    - Reduce database load during tier updates

  2. Changes
    - Index on activity_tier for filtering by tier
    - Index on last_swap_at for time-based tier decisions
    - Index on swap_count_24h for activity level sorting
    - Composite index on (activity_tier, last_swap_at) for hot tier queries
    - Index on last_tier_update for monitoring stale tiers

  3. Benefits
    - Faster tier classification queries (10x-100x speedup)
    - Reduced database CPU usage
    - Better query planning for complex tier filters

  4. Impact
    - Small storage overhead (typically <1% of table size)
    - Slightly slower inserts (negligible for this use case)
    - Major improvement in read performance
*/

-- Index for filtering by activity tier
CREATE INDEX IF NOT EXISTS idx_tokens_activity_tier 
  ON tokens(activity_tier) 
  WHERE activity_tier IS NOT NULL;

-- Index for time-based tier decisions
CREATE INDEX IF NOT EXISTS idx_tokens_last_swap_at 
  ON tokens(last_swap_at DESC) 
  WHERE last_swap_at IS NOT NULL;

-- Index for activity level sorting
CREATE INDEX IF NOT EXISTS idx_tokens_swap_count_24h 
  ON tokens(swap_count_24h DESC) 
  WHERE swap_count_24h > 0;

-- Composite index for hot tier queries (most frequently accessed)
CREATE INDEX IF NOT EXISTS idx_tokens_tier_swap_time 
  ON tokens(activity_tier, last_swap_at DESC)
  WHERE activity_tier = 'hot';

-- Index for monitoring stale tier updates
CREATE INDEX IF NOT EXISTS idx_tokens_last_tier_update 
  ON tokens(last_tier_update) 
  WHERE last_tier_update IS NOT NULL;

-- Index for block number based queries (used by indexer)
CREATE INDEX IF NOT EXISTS idx_tokens_last_checked_block 
  ON tokens(last_checked_block)
  WHERE last_checked_block IS NOT NULL;

-- Composite index for efficient token lookups with reserves
CREATE INDEX IF NOT EXISTS idx_tokens_address_reserves 
  ON tokens(token_address, current_eth_reserve, current_token_reserve);

-- Analyze the table to update query planner statistics
ANALYZE tokens;
