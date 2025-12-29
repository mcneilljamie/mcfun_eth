/*
  # Add Unique Constraint on lock_id for Upsert Operations

  1. Changes
    - Add UNIQUE constraint on lock_id column in token_locks table
    - This enables safe upsert operations to handle duplicate events
    - Prevents duplicate lock_id entries in the database

  2. Purpose
    - Allows the indexer to use UPSERT instead of checking for existing records
    - Ensures data integrity - each lock_id can only appear once
    - Fixes the issue where the indexer skips existing lock_ids even if they were partially processed

  3. Migration Safety
    - First removes any duplicate lock_ids (keeping the most recent one)
    - Then adds the constraint to prevent future duplicates
*/

-- Remove any duplicate lock_ids, keeping only the most recent entry
DELETE FROM token_locks a
USING token_locks b
WHERE a.lock_id = b.lock_id
  AND a.created_at < b.created_at;

-- Add unique constraint on lock_id
ALTER TABLE token_locks
ADD CONSTRAINT token_locks_lock_id_unique UNIQUE (lock_id);

-- Create index for faster upsert operations (if not already exists)
CREATE INDEX IF NOT EXISTS idx_token_locks_lock_id_unique ON token_locks(lock_id);