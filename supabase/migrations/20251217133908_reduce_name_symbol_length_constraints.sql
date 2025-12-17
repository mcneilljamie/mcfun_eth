/*
  # Reduce Name and Symbol Length Constraints

  1. Changes
    - Truncate existing symbols longer than 5 characters
    - Truncate existing names longer than 20 characters
    - Alter `tokens.name` column from `varchar(32)` to `varchar(20)`
    - Alter `tokens.symbol` column from `varchar(10)` to `varchar(5)`

  2. Purpose
    - Enforce stricter length limits aligned with industry standards for memecoins
    - Shorter names/symbols improve UI readability on mobile devices
    - Prevent excessively long names that make token listings look unprofessional
    - Maintain consistency across smart contract, frontend, and database layers

  3. Security
    - Adds stricter defense-in-depth validation at database level
    - Prevents data insertion even if contract or frontend validation is bypassed

  4. Notes
    - Maximum name length: 20 characters
    - Maximum symbol length: 5 characters (standard for most tokens like USDC, WBTC, etc.)
    - These limits match the smart contract validation
    - Existing tokens with longer values will be truncated
*/

-- Truncate existing symbols to 5 characters
UPDATE tokens
SET symbol = LEFT(symbol, 5)
WHERE LENGTH(symbol) > 5;

-- Truncate existing names to 20 characters
UPDATE tokens
SET name = LEFT(name, 20)
WHERE LENGTH(name) > 20;

-- Change name column from varchar(32) to varchar(20)
ALTER TABLE tokens
ALTER COLUMN name TYPE varchar(20);

-- Change symbol column from varchar(10) to varchar(5)
ALTER TABLE tokens
ALTER COLUMN symbol TYPE varchar(5);
