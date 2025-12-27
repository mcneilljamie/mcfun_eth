-- Example: Add a block to the skip list for all indexers
-- Usage: Replace the block number and reason with your values
-- INSERT INTO skip_blocks (block_number, reason, indexer_type)
-- VALUES (123456, 'RPC error / bad block data', 'all');

-- Example: Add a block to skip only for burn indexer
-- INSERT INTO skip_blocks (block_number, reason, indexer_type)
-- VALUES (123456, 'Burn event parsing error', 'burn');

-- Example: Add a block to skip only for swap indexer
-- INSERT INTO skip_blocks (block_number, reason, indexer_type)
-- VALUES (123456, 'Swap event data corrupted', 'swap');

-- Example: Add a block to skip only for lock indexer
-- INSERT INTO skip_blocks (block_number, reason, indexer_type)
-- VALUES (123456, 'Lock event RPC timeout', 'lock');

-- View all skip blocks
-- SELECT * FROM skip_blocks ORDER BY block_number DESC;

-- Remove a skip block
-- DELETE FROM skip_blocks WHERE block_number = 123456 AND indexer_type = 'all';
