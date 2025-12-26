/*
  # Reduce Confirmation Depth for Instant Swap Detection

  1. Changes
    - Reduce confirmation depth from 2 blocks to 0 blocks on Sepolia testnet
    - This eliminates the 24-second delay before swaps appear
    - Swaps will now show up within 10 seconds (next indexer run)

  2. Why This is Safe on Sepolia
    - Sepolia has very rare chain reorganizations
    - Even if a reorg happens, the worst case is duplicate swap detection
    - The unique constraint on swaps prevents actual duplicates in the database
    - Testnet environment is acceptable for this risk/reward tradeoff

  3. Benefits
    - Swaps appear 2-3x faster (10 seconds vs 24-34 seconds)
    - Better user experience with near-instant trade updates
    - More responsive UI for active trading

  4. Production Considerations
    - For mainnet, confirmation depth should be 2-3 blocks minimum
    - Higher value at stake requires protection against reorgs
    - Can be adjusted via indexer_state table without code changes
*/

-- Update the confirmation depth to 0 for instant swap detection
UPDATE indexer_state
SET
  confirmation_depth = 0,
  updated_at = now()
WHERE id IS NOT NULL;

-- If no indexer state exists yet, this will be set when the indexer first runs
-- The indexer defaults to 2, so we're explicitly overriding it here for Sepolia
