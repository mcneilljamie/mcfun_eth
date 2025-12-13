/*
  # Restore Blockchain Reorganization Protection Indexes

  1. Restored Indexes
    - `idx_tokens_block_number` - Used by event-indexer for reorg detection queries (line 58) and rollback deletions (line 87)
    - `idx_tokens_block_hash` - Used by event-indexer for comparing stored vs. chain block hashes during reorg detection (lines 64-66)
    - `idx_swaps_block_number` - Used by event-indexer for rollback deletions (line 92)
    - `idx_swaps_block_hash` - Used by event-indexer for hash comparison during reorg detection
    - `idx_price_snapshots_block_number` - Used by event-indexer for rollback deletions (line 97)

  2. Important Notes
    - These indexes are critical for the event-indexer function to detect blockchain reorganizations
    - They enable efficient rollback of invalid data when chain reorgs occur
    - The detectAndHandleReorg() and rollbackToBlock() functions depend on these indexes
    - Without these indexes, reorg protection queries would be significantly slower

  3. Security
    - These indexes do not create security vulnerabilities
    - They are used exclusively by the event-indexer edge function
    - The previous removal was based on incorrect analysis
*/

-- Restore block number indexes for efficient reorg detection and rollback
CREATE INDEX IF NOT EXISTS idx_tokens_block_number ON tokens(block_number DESC);
CREATE INDEX IF NOT EXISTS idx_swaps_block_number ON swaps(block_number DESC);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_block_number ON price_snapshots(block_number DESC);

-- Restore block hash indexes for reorg detection
CREATE INDEX IF NOT EXISTS idx_tokens_block_hash ON tokens(block_hash);
CREATE INDEX IF NOT EXISTS idx_swaps_block_hash ON swaps(block_hash);
