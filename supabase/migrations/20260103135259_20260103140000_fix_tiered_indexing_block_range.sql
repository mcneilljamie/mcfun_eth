/*
  # Fix Tiered Indexing Block Range Calculation
  
  1. Problem
    - Event indexer calculates block range from global indexer_state
    - Then queries tokens by tier
    - If global state is caught up, it returns "no blocks to index"
    - But individual tokens may be behind (per-token last_checked_block)
    
  2. Solution
    - Update get_tokens_by_tier to return block_number (token creation block)
    - Event indexer should use min(token.last_checked_block) to determine if work is needed
    - When tier-based, skip the global block range check
    
  3. Changes
    - Drop and recreate get_tokens_by_tier with block_number field
    - This allows indexer to see that tokens need processing even if global state is caught up
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_tokens_by_tier(text, integer, integer);

-- Recreate with block_number in return type
CREATE OR REPLACE FUNCTION get_tokens_by_tier(
  tier_name text,
  batch_limit integer DEFAULT 20,
  min_block_age integer DEFAULT 0
)
RETURNS TABLE (
  token_address text,
  amm_address text,
  block_number bigint,
  last_checked_block bigint,
  last_swap_at timestamptz,
  swap_count_24h integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.token_address,
    t.amm_address,
    t.block_number,
    t.last_checked_block,
    t.last_swap_at,
    t.swap_count_24h
  FROM tokens t
  WHERE t.activity_tier = tier_name
  ORDER BY 
    CASE 
      WHEN tier_name = 'hot' THEN t.swap_count_24h
      ELSE 0
    END DESC,
    t.last_swap_at DESC NULLS LAST,
    t.last_checked_block ASC
  LIMIT batch_limit;
END;
$$;
