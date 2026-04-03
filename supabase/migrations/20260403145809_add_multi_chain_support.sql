/*
  # Add Multi-Chain Support for Indexers

  1. Updates
    - Add Base chain indexer state entries for event-indexer and lock-indexer
    - Update indexer_state table to support multiple chains per indexer type
    - Ensure all existing data uses correct chain_id defaults

  2. Security
    - No changes to RLS policies
    - Maintains existing security model

  3. Notes
    - Ethereum mainnet = chain_id 1
    - Base mainnet = chain_id 8453
    - Creates separate indexer state for each chain
    - Lock indexer uses named indexer_name pattern: lock_indexer_{chain_id}
*/

-- Insert Base chain indexer state for event indexer (if not exists)
INSERT INTO indexer_state (chain_id, last_indexed_block, confirmation_depth, updated_at)
VALUES (8453, 24867400, 2, now())
ON CONFLICT DO NOTHING;

-- Insert Base chain indexer state for lock indexer (if not exists)
INSERT INTO lock_indexer_state (indexer_name, chain_id, last_indexed_block, last_indexed_at, is_active)
VALUES ('lock_indexer_8453', 8453, 24867401, now(), false)
ON CONFLICT (indexer_name) DO NOTHING;

-- Update existing Ethereum lock indexer to include chain_id
UPDATE lock_indexer_state
SET chain_id = 1
WHERE indexer_name = 'lock_indexer' AND chain_id IS NULL;

-- Rename existing lock indexer to follow new naming pattern
UPDATE lock_indexer_state
SET indexer_name = 'lock_indexer_1'
WHERE indexer_name = 'lock_indexer';

-- Create Ethereum lock indexer state with new naming pattern (if it doesn't exist)
INSERT INTO lock_indexer_state (indexer_name, chain_id, last_indexed_block, last_indexed_at, is_active)
SELECT 'lock_indexer_1', 1, last_indexed_block, last_indexed_at, is_active
FROM lock_indexer_state
WHERE indexer_name = 'lock_indexer_1'
ON CONFLICT (indexer_name) DO NOTHING;
