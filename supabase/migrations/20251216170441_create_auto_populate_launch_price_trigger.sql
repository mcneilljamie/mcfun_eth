/*
  # Auto-populate Launch Price for New Tokens

  1. Changes
    - Create trigger to automatically calculate and set launch_price_eth when tokens are created
    - Uses the formula: initial_liquidity_eth / (1,000,000 * liquidity_percent / 100)
    
  2. Purpose
    - Ensure all new tokens have launch_price_eth populated immediately
    - Prevents missing data that causes chart and return calculations to fail
    - Makes the system more robust and automatic

  3. Security
    - Function runs as SECURITY DEFINER with restricted search_path
    - Only modifies the row being inserted
*/

-- Function to calculate and set launch price on token insert
CREATE OR REPLACE FUNCTION calculate_launch_price_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Calculate launch price using the correct formula
  NEW.launch_price_eth := (
    NEW.initial_liquidity_eth::NUMERIC / 
    (1000000 * NEW.liquidity_percent / 100)
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger to run before insert on tokens table
DROP TRIGGER IF EXISTS trigger_calculate_launch_price ON tokens;
CREATE TRIGGER trigger_calculate_launch_price
  BEFORE INSERT ON tokens
  FOR EACH ROW
  EXECUTE FUNCTION calculate_launch_price_on_insert();
