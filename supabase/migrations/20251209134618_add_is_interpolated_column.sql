/*
  # Add is_interpolated column to price_snapshots

  ## Summary
  Adds a boolean column to mark snapshots that were synthetically generated
  to fill gaps in the data, versus snapshots that were captured from actual
  blockchain state.

  ## Changes
  1. Columns Added
    - `is_interpolated` (boolean): True if this snapshot was generated to fill
      a gap, false if it was captured from actual blockchain state
      - Defaults to false for all existing snapshots
      - NOT NULL with default value

  2. Indexes
    - Add composite index on (token_address, created_at, is_interpolated)
      for efficient querying of real vs interpolated data

  ## Notes
  - All existing snapshots will be marked as not interpolated (false)
  - Future interpolation processes will mark generated snapshots as true
  - This allows charts to distinguish between real and synthetic data if needed
*/

-- Add is_interpolated column with default false
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_snapshots' AND column_name = 'is_interpolated'
  ) THEN
    ALTER TABLE price_snapshots 
    ADD COLUMN is_interpolated boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Create composite index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_price_snapshots_token_time_interpolated
  ON price_snapshots(token_address, created_at DESC, is_interpolated);