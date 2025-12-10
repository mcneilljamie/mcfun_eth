/*
  # Remove duplicate swaps and add unique constraint

  1. Changes
    - Delete duplicate swap entries (keep only the first occurrence by created_at)
    - Add unique constraint on `tx_hash` column to prevent future duplicates
  
  2. Security
    - This operation is safe as it only removes duplicate data
    - Original swap data is preserved (earliest entry kept)
*/

-- Delete duplicate swaps, keeping only the first entry for each tx_hash
DELETE FROM swaps
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY tx_hash ORDER BY created_at ASC) AS rn
    FROM swaps
    WHERE tx_hash IS NOT NULL
  ) t
  WHERE rn > 1
);

-- Add unique constraint on tx_hash
ALTER TABLE swaps 
  ADD CONSTRAINT swaps_tx_hash_unique UNIQUE (tx_hash);