/*
  # Optimize Recent Trades Query Performance

  1. New Indexes
    - `idx_swaps_token_created` - Composite index on (token_address, created_at DESC)
      - Optimizes the common query pattern: filtering by token_address and ordering by created_at
      - Used by RecentTrades component for fast retrieval of latest trades per token
      - Replaces the need for separate index scans with a single efficient lookup

  2. Performance Impact
    - Significantly faster query execution for recent trades display
    - Enables instant real-time updates via Supabase subscriptions
    - Reduces database load for frequently viewed tokens

  3. Security
    - Read-only index, no security implications
    - Public read access maintained via existing RLS policies
*/

-- Create composite index for efficient token-specific trade queries
CREATE INDEX IF NOT EXISTS idx_swaps_token_created ON swaps(token_address, created_at DESC);
