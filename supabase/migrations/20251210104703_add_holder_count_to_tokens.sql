/*
  # Add Holder Count to Tokens

  1. Changes
    - Add `holder_count` column to `tokens` table (defaults to 0)
    - Create function to calculate unique holders per token
    - Create function to update holder counts for all tokens
  
  2. Holder Calculation Logic
    - A holder is any unique address that has received tokens (token_out > 0 in swaps)
    - The creator is automatically counted as a holder
    - Excludes the AMM address itself
  
  3. Notes
    - Initial holder count will be 0 and can be updated by calling refresh_holder_counts()
    - This can be scheduled via cron or called manually
*/

-- Add holder_count column to tokens table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tokens' AND column_name = 'holder_count'
  ) THEN
    ALTER TABLE tokens ADD COLUMN holder_count integer DEFAULT 0;
  END IF;
END $$;

-- Create function to calculate holder count for a specific token
CREATE OR REPLACE FUNCTION calculate_token_holders(p_token_address text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_holder_count integer;
  v_amm_address text;
BEGIN
  -- Get the AMM address for this token
  SELECT amm_address INTO v_amm_address
  FROM tokens
  WHERE token_address = p_token_address;

  -- Count unique addresses that have received tokens
  -- Exclude the AMM address itself
  SELECT COUNT(DISTINCT user_address) INTO v_holder_count
  FROM swaps
  WHERE token_address = p_token_address
    AND token_out > 0
    AND user_address != COALESCE(v_amm_address, '');

  RETURN COALESCE(v_holder_count, 0);
END;
$$;

-- Create function to refresh holder counts for all tokens
CREATE OR REPLACE FUNCTION refresh_holder_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE tokens
  SET holder_count = calculate_token_holders(token_address);
END;
$$;

-- Create function to refresh holder count for a single token
CREATE OR REPLACE FUNCTION refresh_token_holder_count(p_token_address text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE tokens
  SET holder_count = calculate_token_holders(p_token_address)
  WHERE token_address = p_token_address;
END;
$$;

-- Initial calculation of holder counts
SELECT refresh_holder_counts();
