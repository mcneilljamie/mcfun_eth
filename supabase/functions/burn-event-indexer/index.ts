import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const TOKEN_SUPPLY = 1_000_000_000n * (10n ** 18n);

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
    // Get blocks to skip
    const { data: skipBlocksData } = await supabase
      .from("skip_blocks")
      .select("block_number")
      .in("indexer_type", ["burn", "all"]);

    const skipBlocks = new Set(
      skipBlocksData?.map(sb => sb.block_number) || []
    );

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
    let skippedCount = 0;

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

        // Get current totals and last processed block for this token
        const { data: totalsData } = await supabase
          .from("token_burn_totals")
          .select("*")
          .eq("token_address", token.token_address.toLowerCase())
          .maybeSingle();

        let fromBlock: number;
        let toBlock: number;
        let currentTotalBurned = totalsData?.total_amount_burned || "0";
        let currentTotalValue = totalsData?.total_value_usd || "0";
        let currentBurnCount = totalsData?.burn_count || 0;

        if (totalsData && totalsData.last_burn_block > 0) {
          // Continue from last processed block
          fromBlock = totalsData.last_burn_block + 1;
          toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE, currentBlock);
        } else {
          // For new tokens, start from creation block or fallback to recent blocks
          toBlock = currentBlock;
          const creationBlock = tokenData?.block_number || 0;
          fromBlock = creationBlock > 0 ? creationBlock : Math.max(currentBlock - MAX_BLOCK_RANGE * 5, 0);
        }

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

        // Aggregate burn events
        let newBurnAmount = 0n;
        let newBurnValue = 0;
        let newBurnCount = 0;
        let lastTimestamp: string | null = null;
        let lastBlock = totalsData?.last_burn_block || 0;

        for (const event of events) {
          // Skip blocks marked as erroneous
          if (skipBlocks.has(event.blockNumber)) {
            console.log(`Skipping burn event in block ${event.blockNumber} (marked as erroneous)`);
            skippedCount++;
            continue;
          }

          try {
            const block = await provider.getBlock(event.blockNumber);
            const timestamp = new Date(block!.timestamp * 1000).toISOString();

            // Get token price at that block from price snapshots
            const { data: priceData } = await supabase
              .from("price_snapshots")
              .select("price_eth, eth_price_usd")
              .eq("token_address", token.token_address.toLowerCase())
              .lte("block_number", event.blockNumber)
              .order("block_number", { ascending: false })
              .limit(1);

            // Skip if we don't have price data for this burn
            if (!priceData || priceData.length === 0) {
              console.log(`No price data found for burn at block ${event.blockNumber}`);
              continue;
            }

            const tokenPriceEth = parseFloat(priceData[0].price_eth);
            const ethPriceUsd = parseFloat(priceData[0].eth_price_usd || "3000");

            const burnAmount = BigInt(event.args![2].toString());
            newBurnAmount += burnAmount;

            // Calculate USD value: burned_tokens * token_price_in_eth * eth_price_in_usd
            const burnAmountFloat = Number(burnAmount) / 1e18;
            const burnValueUsd = burnAmountFloat * tokenPriceEth * ethPriceUsd;
            newBurnValue += burnValueUsd;

            newBurnCount++;
            lastTimestamp = timestamp;
            lastBlock = Math.max(lastBlock, event.blockNumber);

          } catch (eventErr) {
            console.error(`Error processing burn event in block ${event.blockNumber}:`, eventErr);
            errorCount++;
          }
        }

        // Update totals if we found new burns, or just update last_burn_block to track progress
        if (newBurnCount > 0 || toBlock > (totalsData?.last_burn_block || 0)) {
          const totalBurned = BigInt(currentTotalBurned) + newBurnAmount;
          const totalValue = parseFloat(currentTotalValue) + newBurnValue;
          const totalCount = currentBurnCount + newBurnCount;

          // Calculate percent of supply burned
          const percentBurned = (Number(totalBurned) / Number(TOKEN_SUPPLY)) * 100;

          const { error: upsertError } = await supabase
            .from("token_burn_totals")
            .upsert({
              token_address: token.token_address.toLowerCase(),
              total_amount_burned: totalBurned.toString(),
              total_value_usd: totalValue.toString(),
              burn_count: totalCount,
              percent_supply_burned: percentBurned.toString(),
              last_burn_timestamp: lastTimestamp || totalsData?.last_burn_timestamp,
              last_burn_block: lastBlock,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "token_address",
            });

          if (upsertError) {
            console.error(`Failed to update burn totals for ${token.token_address}:`, upsertError);
            errorCount++;
          } else {
            processedCount += newBurnCount;
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
        message: `Processed ${processedCount} burns, skipped ${skippedCount} erroneous blocks, ${errorCount} errors`,
        processedCount,
        skippedCount,
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
