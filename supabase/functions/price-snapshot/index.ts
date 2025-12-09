import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const AMM_ABI = [
  "function reserveToken() external view returns (uint256)",
  "function reserveETH() external view returns (uint256)",
  "function getPrice() external view returns (uint256)"
];

async function fetchEthPriceUSD(): Promise<number> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await response.json();
    return data.ethereum?.usd || 3000;
  } catch (error) {
    console.error('Failed to fetch ETH price, using default:', error);
    return 3000;
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
    const rpcUrl = Deno.env.get("ETHEREUM_RPC_URL") || "https://eth.llamarpc.com";

    const supabase = createClient(supabaseUrl, supabaseKey);
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const ethPriceUSD = await fetchEthPriceUSD();

    const { data: tokens, error: tokensError } = await supabase
      .from("tokens")
      .select("token_address, amm_address, symbol");

    if (tokensError) {
      throw new Error(`Failed to fetch tokens: ${tokensError.message}`);
    }

    const results = {
      snapshotsCreated: 0,
      errors: [] as string[],
      timestamp: new Date().toISOString(),
    };

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "No tokens found", ...results }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    for (const token of tokens) {
      try {
        const amm = new ethers.Contract(token.amm_address, AMM_ABI, provider);
        
        const [reserveETH, reserveToken, price] = await Promise.all([
          amm.reserveETH(),
          amm.reserveToken(),
          amm.getPrice(),
        ]);

        const ethReserveFormatted = ethers.formatEther(reserveETH);
        const tokenReserveFormatted = ethers.formatEther(reserveToken);
        const priceFormatted = ethers.formatEther(price);

        // Skip if reserves are zero (token not yet initialized)
        if (ethReserveFormatted === "0.0" || tokenReserveFormatted === "0.0") {
          results.errors.push(`Skipping ${token.symbol}: Zero reserves`);
          continue;
        }

        const { error: snapshotError } = await supabase
          .from("price_snapshots")
          .insert({
            token_address: token.token_address,
            price_eth: priceFormatted,
            eth_reserve: ethReserveFormatted,
            token_reserve: tokenReserveFormatted,
            eth_price_usd: ethPriceUSD,
            created_at: new Date().toISOString(),
          });

        if (snapshotError) {
          results.errors.push(`Failed to create snapshot for ${token.symbol}: ${snapshotError.message}`);
        } else {
          results.snapshotsCreated++;

          // Update current reserves in tokens table
          await supabase
            .from("tokens")
            .update({
              current_eth_reserve: ethReserveFormatted,
              current_token_reserve: tokenReserveFormatted,
            })
            .eq("token_address", token.token_address);
        }
      } catch (err: any) {
        results.errors.push(`Failed to process ${token.symbol}: ${err.message}`);
      }
    }

    // Calculate and store platform statistics
    try {
      // Get all tokens with their current data
      const { data: allTokens, error: allTokensError } = await supabase
        .from("tokens")
        .select("token_address, current_eth_reserve, total_volume_eth");

      if (allTokensError) {
        console.error("Failed to fetch tokens for stats:", allTokensError);
      } else if (allTokens && allTokens.length > 0) {
        // Calculate total market cap using current reserves
        const TOTAL_SUPPLY = 1_000_000;
        let totalMarketCapUSD = 0;
        let totalVolumeETH = 0;

        for (const token of allTokens) {
          const ethReserve = parseFloat(token.current_eth_reserve || "0");
          
          // Calculate price from reserves (if we have reserves)
          if (ethReserve > 0) {
            // Get token reserve from latest snapshot or calculate
            const { data: snapshot } = await supabase
              .from("price_snapshots")
              .select("price_eth")
              .eq("token_address", token.token_address)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (snapshot) {
              const priceETH = parseFloat(snapshot.price_eth);
              const fdv = TOTAL_SUPPLY * priceETH * ethPriceUSD;
              totalMarketCapUSD += fdv;
            }
          }
          
          totalVolumeETH += parseFloat(token.total_volume_eth || "0");
        }

        // Insert platform stats
        const { error: statsError } = await supabase
          .from("platform_stats")
          .insert({
            total_market_cap_usd: totalMarketCapUSD,
            total_volume_eth: totalVolumeETH,
            token_count: allTokens.length,
          });

        if (statsError) {
          console.error("Failed to insert platform stats:", statsError);
        }
      }
    } catch (err: any) {
      console.error("Failed to calculate platform stats:", err);
    }

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
    console.error("Error in price-snapshot:", err);
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
