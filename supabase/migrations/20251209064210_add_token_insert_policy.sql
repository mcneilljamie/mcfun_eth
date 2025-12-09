/*
  # Add INSERT policy for tokens table

  1. Changes
    - Add policy to allow anonymous users to insert tokens
    - This enables the Launch page to create token records in the database
    
  2. Security
    - Allows anyone to insert tokens since token creation is on-chain
    - The on-chain contract is the source of truth for who can create tokens
*/

CREATE POLICY "Allow public insert access to tokens"
  ON tokens
  FOR INSERT
  TO anon
  WITH CHECK (true);