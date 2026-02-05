/*
  # Fix ETH Price Function with Synchronous HTTP Call Pattern

  ## Summary
  Rewrites the track_eth_price function to properly handle asynchronous HTTP responses
  using pg_net's response table with proper polling.

  ## Changes
  1. Uses a more reliable pattern for reading HTTP responses
  2. Adds retry logic for reading responses
  3. Better error handling and logging

  ## Impact
  - More reliable price updates
  - Better visibility into failures
*/

CREATE OR REPLACE FUNCTION track_eth_price()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id bigint;
  response_data jsonb;
  eth_price numeric;
  retry_count int := 0;
  max_retries int := 10;
BEGIN
  -- Make HTTP request directly to CoinGecko API
  SELECT net.http_get(
    url := 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
  ) INTO request_id;
  
  RAISE NOTICE 'ETH price request sent with ID: %', request_id;
  
  -- Poll for response with retries
  WHILE retry_count < max_retries LOOP
    SELECT content::jsonb 
    INTO response_data
    FROM net._http_response
    WHERE id = request_id;
    
    EXIT WHEN response_data IS NOT NULL;
    
    PERFORM pg_sleep(0.1);
    retry_count := retry_count + 1;
  END LOOP;
  
  IF response_data IS NULL THEN
    RAISE WARNING 'No response received from CoinGecko after % retries', max_retries;
    RETURN;
  END IF;
  
  -- Extract ETH price
  eth_price := (response_data->'ethereum'->>'usd')::numeric;
  
  RAISE NOTICE 'ETH price from API: $%', eth_price;
  
  -- Insert into eth_price_history if we got a valid price
  IF eth_price IS NOT NULL AND eth_price > 0 THEN
    INSERT INTO eth_price_history (timestamp, price_usd)
    VALUES (NOW(), eth_price);
    
    RAISE NOTICE 'ETH price successfully inserted: $%', eth_price;
  ELSE
    RAISE WARNING 'Invalid ETH price received: %', eth_price;
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error tracking ETH price: %', SQLERRM;
END;
$$;