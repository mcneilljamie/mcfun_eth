import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";
import { getRPCProviders, getChainConfig } from "../_shared/config.ts";

const corsHeaders = {
  "Content-Type": "application/json",
};

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const TOKEN_SUPPLY = 1_000_000n * (10n ** 18n);

const MAX_EXECUTION_TIME_MS = 23000;
const PARALLEL_TOKEN_LIMIT = 10;

const providerIndexMap = new Map<number, number>();

function getProvider(chainId: number): ethers.JsonRpcProvider {
  const RPC_PROVIDERS = getRPCProviders(chainId);
  const currentProviderIndex = providerIndexMap.get(chainId) || 0;
  const url = RPC_PROVIDERS[currentProviderIndex];
  providerIndexMap.set(chainId, (currentProviderIndex + 1) % RPC_PROVIDERS.length);
  return new ethers.JsonRpcProvider(url);
}

interface TokenPriceCache {
  tokenPriceEth: number;
  ethPriceUsd: number;
}

const priceCache = new Map<string, TokenPriceCache>();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);
  const chainId = parseInt(url.searchParams.get("chain_id") || "1");
  const chainConfig = getChainConfig(chainId);

  console.log(`Starting burn indexer for ${chainConfig.CHAIN_NAME} (chain ID: ${chainId})`);

  const startTime = Date.now();
  const provider = getProvider(chainId);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const currentBlock = await provider.getBlockNumber();

    // Get tokens with existing burns first (priority), then all other tokens
    const { data: tokensWithBurns, error: burnsError } = await supabase
      .from("token_burn_totals")
      .select("token_address")
      .eq("chain_id", chainId)
      .order("last_burn_timestamp", { ascending: false });

    const { data: allTokens, error: tokensError } = await supabase
      .from("tokens")
      .select("token_address, symbol, name")
      .eq("chain_id", chainId);

    if (tokensError || !allTokens || allTokens.length === 0) {
      console.error("Failed to load tokens:", tokensError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to load tokens" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prioritize tokens that have burns (check them first)
    const burnAddresses = new Set(tokensWithBurns?.map(t => t.token_address.toLowerCase()) || []);
    const tokensToCheck = allTokens.sort((a, b) => {
      const aHasBurn = burnAddresses.has(a.token_address.toLowerCase()) ? 0 : 1;
      const bHasBurn = burnAddresses.has(b.token_address.toLowerCase()) ? 0 : 1;
      return aHasBurn - bHasBurn;
    });

    const tokens = tokensToCheck;

    const results = {
      tokensProcessed: 0,
      tokensWithBurns: 0,
      tokensSkippedTimeout: 0,
      errors: [] as string[],
    };

    console.log(`Processing ${tokens.length} tokens (${burnAddresses.size} with existing burns)`);

    for (let i = 0; i < tokens.length; i += PARALLEL_TOKEN_LIMIT) {
      if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
        const remaining = tokens.length - i;
        results.tokensSkippedTimeout = remaining;
        console.log(`Approaching timeout, stopping early (${remaining} tokens skipped)`);
        break;
      }

      const batch = tokens.slice(i, i + PARALLEL_TOKEN_LIMIT);
      const batchResults = await Promise.allSettled(
        batch.map(async (token) => {
          const tokenContract = new ethers.Contract(
            token.token_address,
            [
              "function balanceOf(address) view returns (uint256)",
            ],
            provider
          );

          const burnedBalance = await tokenContract.balanceOf(BURN_ADDRESS);

          const { data: existingBurn } = await supabase
            .from("token_burn_totals")
            .select("total_amount_burned, burn_count, last_burn_timestamp")
            .eq("chain_id", chainId)
            .eq("token_address", token.token_address.toLowerCase())
            .maybeSingle();

          const previousBurnedAmount = existingBurn?.total_amount_burned
            ? BigInt(existingBurn.total_amount_burned)
            : 0n;

          if (burnedBalance <= previousBurnedAmount) {
            return { success: true, hasBurn: false };
          }

          let tokenPriceEth: number;
          let ethPriceUsd: number;

          const cached = priceCache.get(token.token_address.toLowerCase());
          if (cached) {
            tokenPriceEth = cached.tokenPriceEth;
            ethPriceUsd = cached.ethPriceUsd;
          } else {
            const { data: tokenData } = await supabase
              .from("tokens")
              .select("current_eth_reserve, current_token_reserve")
              .eq("chain_id", chainId)
              .eq("token_address", token.token_address.toLowerCase())
              .maybeSingle();

            if (!tokenData || !tokenData.current_token_reserve || parseFloat(tokenData.current_token_reserve) === 0) {
              console.log(`No valid reserve data found for token ${token.token_address}`);
              return { success: false, hasBurn: false };
            }

            const { data: ethPrice } = await supabase
              .from("eth_price_history")
              .select("price_usd")
              .order("timestamp", { ascending: false })
              .limit(1)
              .maybeSingle();

            tokenPriceEth = parseFloat(tokenData.current_eth_reserve) / parseFloat(tokenData.current_token_reserve);

            if (!ethPrice?.price_usd) {
              console.warn(`No ETH price available for burn calculation, skipping ${token.symbol}`);
              return { success: false, hasBurn: false };
            }

            ethPriceUsd = parseFloat(ethPrice.price_usd);
            priceCache.set(token.token_address.toLowerCase(), { tokenPriceEth, ethPriceUsd });
          }

          const burnedAmount = burnedBalance.toString();
          const incrementalBurned = burnedBalance - previousBurnedAmount;
          const burnedAmountFloat = Number(burnedBalance) / 1e18;
          const incrementalBurnedFloat = Number(incrementalBurned) / 1e18;
          const totalValueUsd = burnedAmountFloat * tokenPriceEth * ethPriceUsd;
          const percentBurned = (Number(burnedBalance) / Number(TOKEN_SUPPLY)) * 100;
          const burnCount = (existingBurn?.burn_count || 0) + 1;
          const lastBurnTimestamp = new Date().toISOString();

          const { error: upsertError } = await supabase
            .from("token_burn_totals")
            .upsert({
              chain_id: chainId,
              token_address: token.token_address.toLowerCase(),
              total_amount_burned: burnedAmount,
              total_value_usd: totalValueUsd.toString(),
              burn_count: burnCount,
              percent_supply_burned: percentBurned.toString(),
              last_burn_timestamp: lastBurnTimestamp,
              last_burn_block: currentBlock,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "token_address",
            });

          if (upsertError) {
            console.error(`Failed to update burn totals for ${token.token_address}:`, upsertError);
            return { success: false, hasBurn: true };
          }

          // Record individual burn event for per-burn chart accuracy
          const { error: eventError } = await supabase
            .from("token_burn_events")
            .insert({
              token_address: token.token_address.toLowerCase(),
              chain_id: chainId,
              amount_burned: incrementalBurned.toString(),
              cumulative_burned: burnedAmount,
              percent_supply_burned: percentBurned.toString(),
              burn_timestamp: lastBurnTimestamp,
              burn_block: currentBlock,
            });

          if (eventError) {
            console.error(`Failed to insert burn event for ${token.token_address}:`, eventError);
          }

          console.log(`New burn detected for ${token.symbol}: ${incrementalBurnedFloat.toFixed(2)} tokens (total: ${burnedAmountFloat.toFixed(2)})`);
          return { success: true, hasBurn: true };
        })
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.tokensProcessed++;
          if (result.value.hasBurn) {
            results.tokensWithBurns++;
          }
        } else {
          results.errors.push(result.reason?.message || "Unknown error");
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        chainId,
        chainName: chainConfig.CHAIN_NAME,
        ...results,
        executionTimeMs: Date.now() - startTime,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Burn indexer error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});