/*
  # Simplify ETH Price Function with Async HTTP Call

  ## Summary
  Simplifies the track_eth_price function to use async HTTP calls without blocking.
  The response will be processed on the next cron run, making this more reliable.

  ## Changes
  1. Makes HTTP request without waiting for response
  2. Separate function to process responses
  3. Two-phase approach: fetch then process

  ## Impact
  - More reliable execution
  - No timeouts from blocking operations
  - Responses processed on next run
*/

-- Function to initiate ETH price fetch
CREATE OR REPLACE FUNCTION track_eth_price()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Just make the HTTP request and return immediately
  PERFORM net.http_get(
    url := 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
  );
  
  -- Process any recent responses (from previous calls)
  PERFORM process_eth_price_responses();
END;
$$;

-- Function to process ETH price responses
CREATE OR REPLACE FUNCTION process_eth_price_responses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response_record RECORD;
  eth_price numeric;
BEGIN
  -- Process all recent unprocessed responses
  FOR response_record IN
    SELECT 
      r.id,
      r.content::jsonb as content,
      r.created
    FROM net._http_response r
    WHERE r.created > NOW() - INTERVAL '2 minutes'
      AND r.status_code = 200
      AND r.content::text LIKE '%ethereum%'
      AND NOT EXISTS (
        SELECT 1 FROM eth_price_history h
        WHERE h.created_at >= r.created - INTERVAL '5 seconds'
          AND h.created_at <= r.created + INTERVAL '5 seconds'
      )
    ORDER BY r.created DESC
    LIMIT 5
  LOOP
    BEGIN
      -- Extract ETH price
      eth_price := (response_record.content->'ethereum'->>'usd')::numeric;
      
      -- Insert if valid
      IF eth_price IS NOT NULL AND eth_price > 0 THEN
        INSERT INTO eth_price_history (timestamp, price_usd)
        VALUES (response_record.created, eth_price)
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE 'Processed ETH price: $% from response %', eth_price, response_record.id;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Error processing response %: %', response_record.id, SQLERRM;
    END;
  END LOOP;
END;
$$;