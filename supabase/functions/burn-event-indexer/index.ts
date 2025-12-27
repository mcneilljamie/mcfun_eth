import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BURN_ADDRESS = "0x0000000000000000000000000000000000000000";

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const RPC_PROVIDERS = [
  Deno.env.get("ETHEREUM_RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
];

const MAX_BLOCK_RANGE = 2000;
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
        // Get last processed block for this token's burns
        const { data: lastBurnData } = await supabase
          .from("token_burns")
          .select("block_number")
          .eq("token_address", token.token_address.toLowerCase())
          .order("block_number", { ascending: false })
          .limit(1);

        const fromBlock = lastBurnData && lastBurnData.length > 0
          ? lastBurnData[0].block_number + 1
          : currentBlock - 10000; // Look back 10000 blocks for new tokens

        const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE, currentBlock);

        if (fromBlock > currentBlock) {
          continue;
        }

        // Get Transfer events to burn address
        const tokenContract = new ethers.Contract(
          token.token_address,
          ERC20_ABI,
          provider
        );

        const transferFilter = tokenContract.filters.Transfer(null, BURN_ADDRESS);
        const events = await tokenContract.queryFilter(
          transferFilter,
          fromBlock,
          toBlock
        );

        // Process burn events
        for (const event of events) {
          const block = await provider.getBlock(event.blockNumber);
          const timestamp = new Date(block!.timestamp * 1000).toISOString();

          // Get ETH price at that time
          const { data: ethPriceData } = await supabase
            .from("eth_price_history")
            .select("price_usd")
            .lte("timestamp", timestamp)
            .order("timestamp", { ascending: false })
            .limit(1);

          const ethPriceUsd = ethPriceData && ethPriceData.length > 0
            ? ethPriceData[0].price_usd
            : 3000;

          // Insert burn record
          const { error: insertError } = await supabase
            .from("token_burns")
            .upsert({
              token_address: token.token_address.toLowerCase(),
              burner_address: event.args![0].toLowerCase(),
              amount: event.args![2].toString(),
              tx_hash: event.transactionHash,
              block_number: event.blockNumber,
              timestamp,
              eth_price_usd: ethPriceUsd,
            }, {
              onConflict: "token_address,tx_hash",
            });

          if (insertError) {
            console.error(`Failed to insert burn for ${token.token_address}:`, insertError);
            errorCount++;
          } else {
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
        message: `Processed ${processedCount} burns with ${errorCount} errors`,
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