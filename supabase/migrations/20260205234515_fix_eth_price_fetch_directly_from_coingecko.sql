/*
  # Fix ETH Price Tracking to Fetch Directly from CoinGecko

  ## Summary
  Updates the track_eth_price function to call CoinGecko API directly instead of
  going through an edge function. This eliminates authentication issues and provides
  more reliable real-time price updates.

  ## Changes
  1. Rewrites track_eth_price() to call CoinGecko API directly using pg_net
  2. Parses JSON response and inserts directly into eth_price_history
  3. Removes dependency on edge function authentication

  ## Impact
  - More reliable price updates
  - Eliminates edge function authentication complexity
  - Faster execution with fewer hops
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
BEGIN
  -- Make HTTP request directly to CoinGecko API
  SELECT net.http_get(
    url := 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
  ) INTO request_id;
  
  -- Wait a moment for the response
  PERFORM pg_sleep(0.5);
  
  -- Get the response
  SELECT content::jsonb 
  INTO response_data
  FROM net._http_response
  WHERE id = request_id;
  
  -- Extract ETH price
  eth_price := (response_data->'ethereum'->>'usd')::numeric;
  
  -- Insert into eth_price_history if we got a valid price
  IF eth_price IS NOT NULL AND eth_price > 0 THEN
    INSERT INTO eth_price_history (timestamp, price_usd)
    VALUES (NOW(), eth_price);
    
    RAISE NOTICE 'ETH price updated: $%', eth_price;
  ELSE
    RAISE WARNING 'Failed to fetch valid ETH price from CoinGecko';
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error tracking ETH price: %', SQLERRM;
END;
$$;