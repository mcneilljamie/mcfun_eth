/*
  # Add Website Field to Tokens Table

  1. Changes
    - Add optional `website` column to `tokens` table to store token website URLs
    - Column allows NULL values as website is optional
    - Uses TEXT type for flexible URL length

  2. Notes
    - Existing tokens will have NULL website values
    - New tokens can optionally include a website URL
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tokens' AND column_name = 'website'
  ) THEN
    ALTER TABLE tokens ADD COLUMN website TEXT;
  END IF;
END $$;
