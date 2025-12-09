/*
  # Add Performance Indexes for High-Frequency Queries

  ## Summary
  Adds database indexes to optimize query performance for the 15-second
  snapshot system. With 240+ snapshots per token per hour, efficient
  indexing is critical for maintaining fast query response times.

  ## Changes
  1. Price Snapshots Indexes
    - Composite index on (token_address, created_at DESC) for time-series queries
    - Index on (token_address, is_interpolated, created_at DESC) for filtering
    - Index on created_at alone for global time-based queries

  2. Tokens Table Indexes
    - Index on created_at for age-based filtering
    - Index on amm_address for contract lookups
    - Composite index on (total_volume_eth DESC, created_at DESC) for sorting

  3. Existing Indexes
    - Checks for existing indexes before creating new ones
    - Uses IF NOT EXISTS to prevent errors on re-run

  ## Notes
  - These indexes optimize for:
    - Chart data queries (token + time range)
    - Real vs interpolated data filtering
    - Token sorting by volume and age
    - Platform statistics calculations
  - Indexes consume storage space but dramatically improve query speed
  - Monitor index usage with pg_stat_user_indexes
*/

-- Price snapshots: Primary time-series query pattern
CREATE INDEX IF NOT EXISTS idx_price_snapshots_token_time
  ON price_snapshots(token_address, created_at DESC);

-- Price snapshots: Global time-based queries
CREATE INDEX IF NOT EXISTS idx_price_snapshots_created_at
  ON price_snapshots(created_at DESC);

-- Price snapshots: Filter by interpolated status within time range
CREATE INDEX IF NOT EXISTS idx_price_snapshots_interpolated_time
  ON price_snapshots(is_interpolated, created_at DESC)
  WHERE is_interpolated = false;

-- Tokens: Age-based filtering and sorting
CREATE INDEX IF NOT EXISTS idx_tokens_created_at
  ON tokens(created_at DESC);

-- Tokens: Contract address lookups
CREATE INDEX IF NOT EXISTS idx_tokens_amm_address
  ON tokens(amm_address);

-- Tokens: Volume-based sorting with recency
CREATE INDEX IF NOT EXISTS idx_tokens_volume_created
  ON tokens(total_volume_eth DESC, created_at DESC);

-- Tokens: Market cap calculations (using current reserves)
CREATE INDEX IF NOT EXISTS idx_tokens_eth_reserve
  ON tokens(current_eth_reserve DESC)
  WHERE current_eth_reserve IS NOT NULL;

-- Platform stats: Time-based queries for statistics history
CREATE INDEX IF NOT EXISTS idx_platform_stats_created_at
  ON platform_stats(created_at DESC);

-- Add index on token_address for tokens table (if not primary key)
CREATE INDEX IF NOT EXISTS idx_tokens_address
  ON tokens(token_address);

-- Analyze tables to update query planner statistics
ANALYZE price_snapshots;
ANALYZE tokens;
ANALYZE eth_price_history;
ANALYZE platform_stats;