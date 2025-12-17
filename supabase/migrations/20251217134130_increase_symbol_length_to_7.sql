/*
  # Increase Symbol Length to 7 Characters

  1. Changes
    - Alter `tokens.symbol` column from `varchar(5)` to `varchar(7)`

  2. Purpose
    - Allow slightly longer token symbols while remaining reasonable
    - Accommodate common memecoin naming patterns
    - Maintain consistency with smart contract validation (MAX_SYMBOL_LENGTH = 7)

  3. Security
    - Relaxes constraint slightly from previous migration
    - Still maintains reasonable upper bound to prevent abuse
    - Defense-in-depth validation at database level

  4. Notes
    - Maximum symbol length: 7 characters (up from 5)
    - Maximum name length remains: 20 characters
    - No data needs to be truncated (5-char symbols fit within 7-char limit)
*/

-- Change symbol column from varchar(5) to varchar(7)
ALTER TABLE tokens
ALTER COLUMN symbol TYPE varchar(7);
