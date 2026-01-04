/*
  # Remove Insecure Anonymous Token Insert Policy

  1. Security Changes
    - DROP the insecure anonymous INSERT policy that allows `WITH CHECK (true)`
    - This policy allowed anyone to insert fake tokens into the database
    - Tokens can now only be inserted by authenticated service role (edge functions)

  2. Impact
    - Frontend can no longer directly write to the tokens table
    - Token registration must go through validation edge function
    - Only tokens with valid on-chain TokenLaunched events can be registered

  3. Data Integrity
    - Prevents spam and fake token listings
    - Ensures all tokens in database have legitimate blockchain transactions
    - Event indexer continues to work as backup validation layer
*/

-- Remove the insecure policy that allows anonymous inserts
DROP POLICY IF EXISTS "Allow public insert access to tokens" ON tokens;

-- Add secure policy that only allows service role to insert
-- This is used by edge functions that validate on-chain events
CREATE POLICY "Service role can insert validated tokens"
  ON tokens
  FOR INSERT
  TO service_role
  WITH CHECK (true);