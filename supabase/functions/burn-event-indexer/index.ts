import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const TOKEN_SUPPLY = 1_000_000n * (10n ** 18n);

const RPC_PROVIDERS = [
  Deno.env.get("ETHEREUM_RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
];

const MAX_EXECUTION_TIME_MS = 23000;

let currentProviderIndex = 0;

function getProvider(): ethers.JsonRpcProvider {
  const url = RPC_PROVIDERS[currentProviderIndex];
  currentProviderIndex = (currentProviderIndex + 1) % RPC_PROVIDERS.length;
  return new ethers.JsonRpcProvider(url);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const startTime = Date.now();
  const provider = getProvider();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Get all McFun tokens
    const { data: tokens, error: tokensError } = await supabase
      .from("tokens")
      .select("token_address")
      .not("token_address", "is", null);

    if (tokensError || !tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "No tokens found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current block
    const currentBlock = await provider.getBlockNumber();

    let processedCount = 0;
    let errorCount = 0;

    // Process each token
    for (const token of tokens) {
      if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
        break;
      }

      try {
        // Get token creation block
        const { data: tokenData } = await supabase
          .from("tokens")
          .select("block_number")
          .eq("token_address", token.token_address.toLowerCase())
          .maybeSingle();

        // Get current balance of dead address for this token
        const tokenContract = new ethers.Contract(
          token.token_address,
          [
            "function balanceOf(address) view returns (uint256)",
            "event Transfer(address indexed from, address indexed to, uint256 value)"
          ],
          provider
        );

        const burnedBalance = await tokenContract.balanceOf(BURN_ADDRESS);

        // Get current token price from most recent price snapshot
        const { data: priceData } = await supabase
          .from("price_snapshots")
          .select("price_eth, eth_price_usd")
          .eq("token_address", token.token_address.toLowerCase())
          .order("block_number", { ascending: false })
          .limit(1);

        // Skip if we don't have price data
        if (!priceData || priceData.length === 0) {
          console.log(`No price data found for token ${token.token_address}`);
          continue;
        }

        const tokenPriceEth = parseFloat(priceData[0].price_eth);
        const ethPriceUsd = parseFloat(priceData[0].eth_price_usd || "3000");

        // Calculate USD value using current price: burned_tokens * token_price_in_eth * eth_price_in_usd
        const burnedAmount = burnedBalance.toString();
        const burnedAmountFloat = Number(burnedBalance) / 1e18;
        const totalValueUsd = burnedAmountFloat * tokenPriceEth * ethPriceUsd;

        // Calculate percent of supply burned
        const percentBurned = (Number(burnedBalance) / Number(TOKEN_SUPPLY)) * 100;

        // Set burn count to 1 if there's any balance, 0 otherwise (actual event count is too slow to query)
        const burnCount = burnedBalance > 0n ? 1 : 0;
        const lastBurnTimestamp = burnedBalance > 0n ? new Date().toISOString() : null;

        // Update totals
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
          errorCount++;
        } else {
          if (burnCount > 0) {
            processedCount++;
          }
        }
      } catch (err) {
        console.error(`Error processing burns for token ${token.token_address}:`, err);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${processedCount} tokens with burns, ${errorCount} errors`,
        processedCount,
        errorCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error in burn-event-indexer:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
