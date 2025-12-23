/*
  # Add Withdrawal Transaction Hash to Token Locks

  1. Changes
    - Add `withdraw_tx_hash` column to `token_locks` table
    - Stores the transaction hash when tokens are withdrawn
    - Allows users to view the correct transaction for withdrawn locks

  2. Purpose
    - Currently withdrawn locks show the lock transaction, not the withdrawal transaction
    - This field will store the withdrawal transaction hash for better UX
    - Users can track both the lock and withdraw transactions separately
*/

ALTER TABLE token_locks
ADD COLUMN IF NOT EXISTS withdraw_tx_hash text;

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_token_locks_withdraw_tx ON token_locks(withdraw_tx_hash) WHERE withdraw_tx_hash IS NOT NULL;