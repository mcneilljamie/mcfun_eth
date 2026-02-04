import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log("Fetching ETH price from CoinGecko...");

    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await response.json();

    console.log("CoinGecko response:", JSON.stringify(data));

    const ethPrice = data.ethereum?.usd;

    return new Response(
      JSON.stringify({
        success: true,
        raw_response: data,
        eth_price_usd: ethPrice,
        timestamp: new Date().toISOString()
      }),
      {
        headers: corsHeaders,
      }
    );
  } catch (err: any) {
    console.error("Error fetching ETH price:", err);
    return new Response(
      JSON.stringify({
        error: err.message,
        stack: err.stack
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});
