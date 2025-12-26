/*
  # Create Activity Tier Classification Functions

  1. Functions
    - `update_token_activity_tier(token_addr)` - Updates a single token's activity tier
    - `update_all_activity_tiers()` - Batch updates all token activity tiers
    - `get_tokens_by_tier(tier, limit)` - Gets tokens in a specific tier for processing
    - `record_token_swap_activity(token_addr)` - Updates activity metrics when swap detected

  2. Activity Tier Rules
    - HOT: Last swap within 1 hour
    - WARM: Last swap within 24 hours (but not hot)
    - COLD: Last swap within 7 days (but not warm)
    - DORMANT: No swap in last 7 days or never swapped

  3. Notes
    - These functions will be called by the indexer to manage token priorities
    - Automatic tier promotion when new swaps detected
    - Efficient tier-based querying for scalable processing
*/

-- Function to determine activity tier based on last_swap_at
CREATE OR REPLACE FUNCTION calculate_activity_tier(last_swap timestamptz)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF last_swap IS NULL THEN
    RETURN 'dormant';
  ELSIF last_swap > now() - interval '1 hour' THEN
    RETURN 'hot';
  ELSIF last_swap > now() - interval '24 hours' THEN
    RETURN 'warm';
  ELSIF last_swap > now() - interval '7 days' THEN
    RETURN 'cold';
  ELSE
    RETURN 'dormant';
  END IF;
END;
$$;

-- Function to update a single token's activity tier
CREATE OR REPLACE FUNCTION update_token_activity_tier(token_addr text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_tier text;
  current_swap_count integer;
BEGIN
  -- Calculate new tier based on last_swap_at
  SELECT calculate_activity_tier(last_swap_at)
  INTO new_tier
  FROM tokens
  WHERE token_address = token_addr;

  -- Calculate 24h swap count
  SELECT COUNT(*)
  INTO current_swap_count
  FROM swaps
  WHERE token_address = token_addr
    AND created_at > now() - interval '24 hours';

  -- Update token with new tier and swap count
  UPDATE tokens
  SET 
    activity_tier = new_tier,
    swap_count_24h = current_swap_count,
    last_tier_update = now()
  WHERE token_address = token_addr;
END;
$$;

-- Function to batch update all activity tiers (run periodically)
CREATE OR REPLACE FUNCTION update_all_activity_tiers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE tokens
  SET 
    activity_tier = calculate_activity_tier(last_swap_at),
    last_tier_update = now()
  WHERE last_tier_update < now() - interval '5 minutes'
    OR last_tier_update IS NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count;
END;
$$;

-- Function to get tokens by tier for processing
CREATE OR REPLACE FUNCTION get_tokens_by_tier(
  tier_name text,
  batch_limit integer DEFAULT 20,
  min_block_age integer DEFAULT 0
)
RETURNS TABLE (
  token_address text,
  amm_address text,
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

-- Function to record swap activity (called when new swaps indexed)
CREATE OR REPLACE FUNCTION record_token_swap_activity(
  token_addr text,
  swap_timestamp timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_tier text;
BEGIN
  -- Update last_swap_at
  UPDATE tokens
  SET last_swap_at = swap_timestamp
  WHERE token_address = token_addr
    AND (last_swap_at IS NULL OR last_swap_at < swap_timestamp);

  -- Calculate and update tier (promote to hot if swap is recent)
  IF swap_timestamp > now() - interval '1 hour' THEN
    new_tier := 'hot';
  ELSE
    new_tier := calculate_activity_tier(swap_timestamp);
  END IF;

  UPDATE tokens
  SET 
    activity_tier = new_tier,
    last_tier_update = now(),
    swap_count_24h = (
      SELECT COUNT(*)
      FROM swaps
      WHERE token_address = token_addr
        AND created_at > now() - interval '24 hours'
    )
  WHERE token_address = token_addr;
END;
$$;

-- Function to get activity tier statistics
CREATE OR REPLACE FUNCTION get_activity_tier_stats()
RETURNS TABLE (
  tier text,
  token_count bigint,
  total_volume_eth numeric,
  avg_swap_count_24h numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    activity_tier as tier,
    COUNT(*) as token_count,
    SUM(total_volume_eth) as total_volume_eth,
    AVG(swap_count_24h) as avg_swap_count_24h
  FROM tokens
  GROUP BY activity_tier
  ORDER BY 
    CASE activity_tier
      WHEN 'hot' THEN 1
      WHEN 'warm' THEN 2
      WHEN 'cold' THEN 3
      WHEN 'dormant' THEN 4
      ELSE 5
    END;
$$;