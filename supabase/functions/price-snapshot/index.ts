import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";
import { withLock } from "../_shared/lockManager.ts";

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

// RPC providers with fallback support
const RPC_PROVIDERS = [
  Deno.env.get("ETHEREUM_RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
  "https://rpc2.sepolia.org",
];

let currentProviderIndex = 0;

// Create provider with automatic failover
async function createProviderWithFailover(): Promise<ethers.JsonRpcProvider> {
  for (let i = 0; i < RPC_PROVIDERS.length; i++) {
    const providerUrl = RPC_PROVIDERS[(currentProviderIndex + i) % RPC_PROVIDERS.length];
    try {
      const provider = new ethers.JsonRpcProvider(providerUrl);
      await provider.getBlockNumber();
      currentProviderIndex = (currentProviderIndex + i) % RPC_PROVIDERS.length;
      return provider;
    } catch (error) {
      console.error(`RPC provider ${providerUrl} failed, trying next...`, error);
      continue;
    }
  }
  throw new Error("All RPC providers failed");
}

// Retry function with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 100
): Promise<T> {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// Fetch ETH price from historical table (preferred) or CoinGecko API (fallback)
async function fetchEthPriceUSD(supabase: any): Promise<number> {
  const { data, error } = await supabase
    .from("eth_price_history")
    .select("price_usd")
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    return data.price_usd;
  }

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
    return await withLock("price_snapshot_lock", async () => {
      return await processPriceSnapshot();
    }, {
      timeoutSeconds: 180,
      autoRenew: false,
    });
  } catch (err: any) {
    console.error("Error acquiring lock or executing price-snapshot:", err);
    return new Response(
      JSON.stringify({
        error: err.message,
        message: err.message.includes("Failed to acquire lock")
          ? "Price snapshot is busy processing. This request will be retried automatically."
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

async function processPriceSnapshot(): Promise<Response> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const provider = await retryWithBackoff(() => createProviderWithFailover());

    const currentBlockNumber = await retryWithBackoff(() => provider.getBlockNumber());

    const ethPriceUSD = await fetchEthPriceUSD(supabase);

    // Only process tokens with recent activity (trades in last 48 hours) OR very new tokens (< 1 hour old)
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // First, get tokens with recent swaps
    const { data: recentSwaps } = await supabase
      .from("swaps")
      .select("token_address")
      .gte("created_at", fortyEightHoursAgo);

    const activeTokenAddresses = new Set(recentSwaps?.map(s => s.token_address) || []);

    // Get all tokens that are either new (< 1 hour) or have recent swaps
    const { data: newTokens } = await supabase
      .from("tokens")
      .select(`
        token_address,
        amm_address,
        symbol,
        created_at
      `)
      .gte("created_at", oneHourAgo);

    const { data: activeTokens } = await supabase
      .from("tokens")
      .select(`
        token_address,
        amm_address,
        symbol,
        created_at
      `)
      .in("token_address", Array.from(activeTokenAddresses));

    // Combine and deduplicate
    const tokenMap = new Map();
    [...(newTokens || []), ...(activeTokens || [])].forEach(token => {
      tokenMap.set(token.token_address, token);
    });
    const tokens = Array.from(tokenMap.values());

    const tokensError = null;

    const results = {
      snapshotsCreated: 0,
      errors: [] as string[],
      timestamp: new Date().toISOString(),
      tokensProcessed: 0,
      tokensSkipped: 0,
      ethPriceUsd: ethPriceUSD,
    };

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active tokens found", ...results }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const batchSize = 5;
    const snapshotsToInsert = [];
    const tokensToUpdate = [];

    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(async (token) => {
          return await retryWithBackoff(async () => {
            const amm = new ethers.Contract(token.amm_address, AMM_ABI, provider);

            const [reserveETH, reserveToken, price] = await Promise.all([
              amm.reserveETH(),
              amm.reserveToken(),
              amm.getPrice(),
            ]);

            const ethReserveFormatted = ethers.formatEther(reserveETH);
            const tokenReserveFormatted = ethers.formatEther(reserveToken);
            const priceFormatted = ethers.formatEther(price);

            if (ethReserveFormatted === "0.0" || tokenReserveFormatted === "0.0") {
              return { success: false, error: `Zero reserves for ${token.symbol}`, skipped: true };
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
                block_number: currentBlockNumber,
                created_at: new Date().toISOString(),
              },
              update: {
                token_address: token.token_address,
                current_eth_reserve: ethReserveFormatted,
                current_token_reserve: tokenReserveFormatted,
              },
            };
          }, 2, 200);
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value.success) {
          snapshotsToInsert.push(result.value.snapshot);
          tokensToUpdate.push(result.value.update);
          results.tokensProcessed++;
        } else if (result.status === 'fulfilled' && result.value.skipped) {
          results.tokensSkipped++;
        } else if (result.status === 'fulfilled') {
          results.errors.push(result.value.error);
        } else {
          results.errors.push(`Batch processing error: ${result.reason}`);
        }
      }
    }

    if (snapshotsToInsert.length > 0) {
      const insertBatchSize = 100;
      for (let i = 0; i < snapshotsToInsert.length; i += insertBatchSize) {
        const insertBatch = snapshotsToInsert.slice(i, i + insertBatchSize);
        const { error: snapshotError } = await supabase
          .from("price_snapshots")
          .upsert(insertBatch, {
            onConflict: 'token_address,block_number',
            ignoreDuplicates: false
          });

        if (snapshotError) {
          results.errors.push(`Failed to upsert snapshot batch: ${snapshotError.message}`);
        } else {
          results.snapshotsCreated += insertBatch.length;
        }
      }
    }

    for (const update of tokensToUpdate) {
      await supabase
        .from("tokens")
        .update({
          current_eth_reserve: update.current_eth_reserve,
          current_token_reserve: update.current_token_reserve,
        })
        .eq("token_address", update.token_address);
    }

    const shouldCalculateStats = Math.random() < 0.25;

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
}
