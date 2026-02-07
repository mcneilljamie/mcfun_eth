import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { verifyCronSecret, createUnauthorizedResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Content-Type": "application/json",
};

async function fetchCurrentEthPrice(): Promise<number> {
  try {
    console.log("Fetching ETH price from CoinGecko...");
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');

    if (!response.ok) {
      throw new Error(`CoinGecko API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("CoinGecko response:", JSON.stringify(data));

    const ethPrice = data.ethereum?.usd;
    if (!ethPrice || ethPrice <= 0) {
      throw new Error(`Invalid ETH price received: ${ethPrice}`);
    }

    console.log(`Successfully fetched ETH price: $${ethPrice}`);
    return ethPrice;
  } catch (error) {
    console.error('Failed to fetch ETH price from CoinGecko:', error);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch current ETH price from CoinGecko
    const ethPriceUsd = await fetchCurrentEthPrice();
    const timestamp = new Date().toISOString();

    // Insert into eth_price_history table
    const { error: insertError } = await supabase
      .from("eth_price_history")
      .insert({
        timestamp,
        price_usd: ethPriceUsd,
      });

    if (insertError) {
      throw new Error(`Failed to insert ETH price: ${insertError.message}`);
    }

    console.log(`ETH price tracked: $${ethPriceUsd} at ${timestamp}`);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp,
        price_usd: ethPriceUsd,
      }),
      {
        headers: corsHeaders,
      }
    );
  } catch (err: any) {
    console.error("Error in track-eth-price:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});