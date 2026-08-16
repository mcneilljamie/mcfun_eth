/*
# Add indexing health monitoring view
# Allows checking: current block, last indexed block, lag, last run status, swap counts
*/

CREATE OR REPLACE VIEW indexer_health AS
SELECT
  ist.chain_id,
  CASE ist.chain_id WHEN 1 THEN 'Ethereum' WHEN 8453 THEN 'Base' ELSE 'Unknown' END as chain_name,
  ist.last_indexed_block,
  ist.updated_at as last_run_at,
  EXTRACT(EPOCH FROM (NOW() - ist.updated_at))::integer as seconds_since_last_run,
  (SELECT count(*) FROM swaps s WHERE s.chain_id = ist.chain_id) as total_swaps_indexed,
  (SELECT count(*) FROM price_snapshots ps WHERE ps.chain_id = ist.chain_id) as total_snapshots,
  (SELECT max(block_number) FROM swaps s WHERE s.chain_id = ist.chain_id) as latest_swap_block
FROM indexer_state ist
ORDER BY ist.chain_id;

CREATE OR REPLACE VIEW token_indexing_health AS
SELECT
  t.token_address,
  t.name,
  t.symbol,
  t.chain_id,
  t.block_number as token_creation_block,
  (SELECT count(*) FROM swaps s WHERE s.token_address = t.token_address AND s.chain_id = t.chain_id) as indexed_swap_count,
  (SELECT count(*) FROM price_snapshots ps WHERE ps.token_address = t.token_address AND ps.chain_id = t.chain_id) as snapshot_count,
  (SELECT count(*) FROM price_snapshots ps WHERE ps.token_address = t.token_address AND ps.chain_id = t.chain_id AND ps.is_reconstructed = true) as reconstructed_count,
  (SELECT max(block_number) FROM swaps s WHERE s.token_address = t.token_address AND s.chain_id = t.chain_id) as latest_swap_block,
  t.current_eth_reserve,
  t.current_token_reserve
FROM tokens t
ORDER BY t.chain_id, t.created_at;
