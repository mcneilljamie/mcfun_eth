import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function fetchCurrentEthPrice(): Promise<number> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await response.json();
    return data.ethereum?.usd || 3000;
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
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: any) {
    console.error("Error in track-eth-price:", err);
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
});