import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";
import { verifyCronSecret, createUnauthorizedResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Content-Type": "application/json",
};

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const TOKEN_SUPPLY = 1_000_000n * (10n ** 18n);

const RPC_PROVIDERS = [
  Deno.env.get("ETHEREUM_RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
];

const MAX_EXECUTION_TIME_MS = 23000;
const PARALLEL_TOKEN_LIMIT = 10;

let currentProviderIndex = 0;

function getProvider(): ethers.JsonRpcProvider {
  const url = RPC_PROVIDERS[currentProviderIndex];
  currentProviderIndex = (currentProviderIndex + 1) % RPC_PROVIDERS.length;
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

  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    console.warn("Unauthorized access attempt to burn-event-indexer");
    return createUnauthorizedResponse(
      authResult.error || "Unauthorized",
      authResult.statusCode,
      corsHeaders
    );
  }

  const startTime = Date.now();
  const provider = getProvider();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const currentBlock = await provider.getBlockNumber();

    const { data: tokens, error: tokensError } = await supabase
      .from("tokens")
      .select("token_address, symbol, name");

    if (tokensError || !tokens || tokens.length === 0) {
      console.error("Failed to load tokens:", tokensError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to load tokens" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = {
      tokensProcessed: 0,
      tokensWithBurns: 0,
      errors: [] as string[],
    };

    for (let i = 0; i < tokens.length; i += PARALLEL_TOKEN_LIMIT) {
      if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
        console.log("Approaching timeout, stopping early");
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
            ethPriceUsd = ethPrice?.price_usd || 3000;

            priceCache.set(token.token_address.toLowerCase(), { tokenPriceEth, ethPriceUsd });
          }

          const burnedAmount = burnedBalance.toString();
          const burnedAmountFloat = Number(burnedBalance) / 1e18;
          const totalValueUsd = burnedAmountFloat * tokenPriceEth * ethPriceUsd;
          const percentBurned = (Number(burnedBalance) / Number(TOKEN_SUPPLY)) * 100;
          const burnCount = burnedBalance > 0n ? 1 : 0;
          const lastBurnTimestamp = burnedBalance > 0n ? new Date().toISOString() : null;

          const { error: upsertError } = await supabase
            .from("token_burn_totals")
            .upsert({
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
            return { success: false, hasBurn: burnCount > 0 };
          }

          return { success: true, hasBurn: burnCount > 0 };
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