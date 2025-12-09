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

// Fetch ETH price from historical table (preferred) or CoinGecko API (fallback)
async function fetchEthPriceUSD(supabase: any): Promise<number> {
  // Try to get latest price from eth_price_history table
  const { data, error } = await supabase
    .from("eth_price_history")
    .select("price_usd")
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    return data.price_usd;
  }

  // Fallback to CoinGecko API if table is empty
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const apiData = await response.json();
    return apiData.ethereum?.usd || 3000;
  } catch (fetchError) {
    console.error('Failed to fetch ETH price, using default:', fetchError);
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

    // Get ETH price from historical data or API
    const ethPriceUSD = await fetchEthPriceUSD(supabase);

    // Get ALL tokens - no age filtering for 15-second snapshots
    const { data: tokens, error: tokensError } = await supabase
      .from("tokens")
      .select("token_address, amm_address, symbol, created_at");

    if (tokensError) {
      throw new Error(`Failed to fetch tokens: ${tokensError.message}`);
    }

    const results = {
      snapshotsCreated: 0,
      errors: [] as string[],
      timestamp: new Date().toISOString(),
      tokensProcessed: 0,
      ethPriceUsd: ethPriceUSD,
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

    // Process tokens in parallel batches for better performance
    const batchSize = 10;
    const snapshotsToInsert = [];
    const tokensToUpdate = [];

    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (token) => {
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
            return { success: false, error: `Zero reserves for ${token.symbol}` };
          }

          return {
            success: true,
            token,
            snapshot: {
              token_address: token.token_address,
              price_eth: priceFormatted,
              eth_reserve: ethReserveFormatted,
              token_reserve: tokenReserveFormatted,
              eth_price_usd: ethPriceUSD,
              is_interpolated: false,
              created_at: new Date().toISOString(),
            },
            update: {
              token_address: token.token_address,
              current_eth_reserve: ethReserveFormatted,
              current_token_reserve: tokenReserveFormatted,
            },
          };
        })
      );

      // Process batch results
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value.success) {
          snapshotsToInsert.push(result.value.snapshot);
          tokensToUpdate.push(result.value.update);
          results.tokensProcessed++;
        } else if (result.status === 'fulfilled') {
          results.errors.push(result.value.error);
        } else {
          results.errors.push(`Batch processing error: ${result.reason}`);
        }
      }
    }

    // Bulk insert snapshots
    if (snapshotsToInsert.length > 0) {
      const insertBatchSize = 100;
      for (let i = 0; i < snapshotsToInsert.length; i += insertBatchSize) {
        const insertBatch = snapshotsToInsert.slice(i, i + insertBatchSize);
        const { error: snapshotError } = await supabase
          .from("price_snapshots")
          .insert(insertBatch);

        if (snapshotError) {
          results.errors.push(`Failed to insert snapshot batch: ${snapshotError.message}`);
        } else {
          results.snapshotsCreated += insertBatch.length;
        }
      }
    }

    // Bulk update token reserves
    for (const update of tokensToUpdate) {
      await supabase
        .from("tokens")
        .update({
          current_eth_reserve: update.current_eth_reserve,
          current_token_reserve: update.current_token_reserve,
        })
        .eq("token_address", update.token_address);
    }

    // Calculate and store platform statistics (less frequently to save time)
    // Only run stats calculation every 4th snapshot cycle (once per minute)
    const shouldCalculateStats = Math.random() < 0.25; // 25% chance = ~once per minute
    
    if (shouldCalculateStats && snapshotsToInsert.length > 0) {
      try {
        const { data: allTokens, error: allTokensError } = await supabase
          .from("tokens")
          .select("token_address, current_eth_reserve, total_volume_eth");

        if (!allTokensError && allTokens && allTokens.length > 0) {
          const TOTAL_SUPPLY = 1_000_000;
          let totalMarketCapUSD = 0;
          let totalVolumeETH = 0;

          for (const token of allTokens) {
            const ethReserve = parseFloat(token.current_eth_reserve || "0");
            
            if (ethReserve > 0) {
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

          await supabase
            .from("platform_stats")
            .insert({
              total_market_cap_usd: totalMarketCapUSD,
              total_volume_eth: totalVolumeETH,
              token_count: allTokens.length,
            });
        }
      } catch (err: any) {
        console.error("Failed to calculate platform stats:", err);
      }
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