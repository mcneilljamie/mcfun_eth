import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { withLock } from "../_shared/lockManager.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CoinGeckoHistoricalResponse {
  prices: [number, number][]; // [timestamp_ms, price_usd]
}

async function fetchHistoricalEthPrices(fromTimestamp: number, toTimestamp: number): Promise<CoinGeckoHistoricalResponse> {
  const url = `https://api.coingecko.com/api/v3/coins/ethereum/market_chart/range?vs_currency=usd&from=${fromTimestamp}&to=${toTimestamp}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    return await withLock("backfill_lock", async () => {
      return await processBackfillEthPrices(req);
    }, {
      timeoutSeconds: 600,
      autoRenew: true,
      renewIntervalMs: 60000,
    });
  } catch (err: any) {
    console.error("Error acquiring lock or executing backfill-eth-prices:", err);
    return new Response(
      JSON.stringify({
        error: err.message,
        message: err.message.includes("Failed to acquire lock")
          ? "A backfill operation is already running. This request will be retried automatically."
          : undefined
      }),
      {
        status: err.message.includes("Failed to acquire lock") ? 503 : 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

async function processBackfillEthPrices(req: Request): Promise<Response> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body to get date range
    const requestBody = await req.json().catch(() => ({}));
    const daysToBackfill = requestBody.days || 90; // Default to 90 days

    const toTimestamp = Math.floor(Date.now() / 1000); // Current time in seconds
    const fromTimestamp = toTimestamp - (daysToBackfill * 24 * 60 * 60);

    console.log(`Backfilling ETH prices from ${new Date(fromTimestamp * 1000)} to ${new Date(toTimestamp * 1000)}`);

    // Fetch historical ETH prices from CoinGecko
    const historicalData = await fetchHistoricalEthPrices(fromTimestamp, toTimestamp);

    const results = {
      pricesInserted: 0,
      pricesSkipped: 0,
      errors: [] as string[],
      dateRange: {
        from: new Date(fromTimestamp * 1000).toISOString(),
        to: new Date(toTimestamp * 1000).toISOString(),
      },
    };

    // Insert prices into eth_price_history table
    // CoinGecko returns data points roughly every 5 minutes for this range
    for (const [timestampMs, priceUsd] of historicalData.prices) {
      const timestamp = new Date(timestampMs).toISOString();

      // Use upsert to avoid duplicate key errors
      const { error } = await supabase
        .from("eth_price_history")
        .upsert(
          {
            timestamp,
            price_usd: priceUsd,
          },
          { onConflict: "timestamp" }
        );

      if (error) {
        results.errors.push(`Failed to insert price at ${timestamp}: ${error.message}`);
      } else {
        results.pricesInserted++;
      }

      // Add small delay to avoid overwhelming the database
      if (results.pricesInserted % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    console.log(`Backfill complete: ${results.pricesInserted} prices inserted`);

    return new Response(
      JSON.stringify(results),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: any) {
    console.error("Error in backfill-eth-prices:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
}