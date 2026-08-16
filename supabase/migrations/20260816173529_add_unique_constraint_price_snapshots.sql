-- Add unique constraint on (token_address, created_at) to prevent duplicate snapshots
-- This ensures the indexer cannot insert two snapshots for the same token at the same timestamp

-- First check if the constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uniq_price_snapshots_token_created'
  ) THEN
    ALTER TABLE price_snapshots 
    ADD CONSTRAINT uniq_price_snapshots_token_created 
    UNIQUE (token_address, created_at);
  END IF;
END $$;
