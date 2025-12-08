/*
  # Fix Database Security Issues

  1. Remove Unused Indexes
    - Drop `idx_tokens_amm` - AMM address lookups are not frequently used
    - Drop `idx_swaps_token` - Token address lookups on swaps are infrequent
    - Drop `idx_swaps_created` - Creation date sorting on swaps is not used
    - Check for and drop `trades_created_at_idx` if it exists

  2. Fix Function Security
    - Update `call_price_snapshot` function to use immutable search_path
    - Set explicit search_path to prevent SQL injection vulnerabilities

  3. Move Extension to Proper Schema
    - Move `pg_net` extension from public schema to extensions schema
    - This follows PostgreSQL security best practices

  4. Notes
    - Unused indexes waste disk space and slow down write operations
    - Mutable search_path in SECURITY DEFINER functions is a security risk
    - Extensions in public schema can cause naming conflicts and security issues
*/

-- Drop unused indexes to improve write performance and reduce storage
DROP INDEX IF EXISTS idx_tokens_amm;
DROP INDEX IF EXISTS idx_swaps_token;
DROP INDEX IF EXISTS idx_swaps_created;
DROP INDEX IF EXISTS trades_created_at_idx;

-- Recreate the call_price_snapshot function with secure search_path
CREATE OR REPLACE FUNCTION call_price_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
BEGIN
  -- Get Supabase URL and service role key from environment
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- If settings are not available, try to use default URL pattern
  IF supabase_url IS NULL THEN
    -- This will be set by Supabase automatically in production
    supabase_url := 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co';
  END IF;
  
  -- Call the edge function using pg_net
  IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
    PERFORM extensions.net.http_post(
      url := supabase_url || '/functions/v1/price-snapshot',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_role_key,
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  END IF;
END;
$$;

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move pg_net extension to extensions schema
DO $$
BEGIN
  -- Drop and recreate in proper schema
  DROP EXTENSION IF EXISTS pg_net;
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
END $$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT USAGE ON SCHEMA extensions TO service_role;