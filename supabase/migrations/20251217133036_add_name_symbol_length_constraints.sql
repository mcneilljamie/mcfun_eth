/*
  # Add Name and Symbol Length Constraints

  1. Changes
    - Alter `tokens.name` column from `text` to `varchar(32)`
    - Alter `tokens.symbol` column from `text` to `varchar(10)`

  2. Purpose
    - Prevent database bloat from excessively long token names/symbols
    - Enforce consistent length limits across contract, frontend, and database
    - Improve query performance with fixed-width columns
    - Maintain UI/UX consistency across token listings

  3. Security
    - Adds defense-in-depth validation at database level
    - Prevents data insertion even if contract or frontend validation is bypassed
    - Existing tokens remain unaffected (no data loss)

  4. Notes
    - Maximum name length: 32 characters (industry standard)
    - Maximum symbol length: 10 characters (industry standard)
    - These limits match the smart contract validation
*/

-- Change name column from text to varchar(32)
ALTER TABLE tokens
ALTER COLUMN name TYPE varchar(32);

-- Change symbol column from text to varchar(10)
ALTER TABLE tokens
ALTER COLUMN symbol TYPE varchar(10);
