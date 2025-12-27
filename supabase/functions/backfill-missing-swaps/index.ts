import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const AMM_ABI = [
  "event Swap(address indexed user, uint256 ethIn, uint256 tokenIn, uint256 ethOut, uint256 tokenOut)",
  "function reserveToken() external view returns (uint256)",
  "function reserveETH() external view returns (uint256)",
];

const RPC_URL = Deno.env.get("ETHEREUM_RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    const {
      token_address,
      from_block,
      to_block,
      force = false // Force re-index even if swaps exist
    } = await req.json();

    if (!token_address) {
      return new Response(
        JSON.stringify({ error: "token_address is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get token details
    const { data: token } = await supabase
      .from("tokens")
      .select("*")
      .eq("token_address", token_address.toLowerCase())
      .maybeSingle();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const startBlock = from_block || token.block_number;
    const endBlock = to_block || token.last_checked_block || await provider.getBlockNumber();

    console.log(`Backfilling swaps for ${token.symbol} (${token.token_address}) from block ${startBlock} to ${endBlock}`);

    // Query on-chain events
    const contract = new ethers.Contract(token.amm_address, AMM_ABI, provider);
    const filter = contract.filters.Swap();
    const events = await contract.queryFilter(filter, startBlock, endBlock);

    console.log(`Found ${events.length} swap events on-chain`);

    if (events.length === 0) {
      return new Response(
        JSON.stringify({
          token_address: token.token_address,
          symbol: token.symbol,
          swaps_found: 0,
          swaps_inserted: 0,
          message: "No swaps found in specified block range",
          execution_time_ms: Date.now() - startTime,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Prepare swap data
    const swapsToInsert: any[] = [];
    const blockCache = new Map<number, ethers.Block>();

    for (const event of events) {
      const args = event.args!;

      // Get block data (cached to avoid multiple requests for same block)
      let block = blockCache.get(event.blockNumber);
      if (!block) {
        block = (await provider.getBlock(event.blockNumber))!;
        blockCache.set(event.blockNumber, block);
      }

      swapsToInsert.push({
        token_address: token.token_address,
        amm_address: token.amm_address,
        user_address: args.user.toLowerCase(),
        eth_in: ethers.formatEther(args.ethIn),
        token_in: ethers.formatEther(args.tokenIn),
        eth_out: ethers.formatEther(args.ethOut),
        token_out: ethers.formatEther(args.tokenOut),
        tx_hash: event.transactionHash,
        created_at: new Date(block.timestamp * 1000).toISOString(),
        block_number: block.number,
        block_hash: block.hash,
      });
    }

    // Insert swaps (upsert to avoid duplicates)
    const { error: swapError, count } = await supabase
      .from("swaps")
      .upsert(swapsToInsert, { onConflict: "tx_hash", count: "exact", ignoreDuplicates: !force });

    if (swapError) {
      throw new Error(`Failed to insert swaps: ${swapError.message}`);
    }

    console.log(`Successfully inserted ${count} swaps`);

    // Update token reserves and volume
    const [reserveETH, reserveToken] = await Promise.all([
      contract.reserveETH(),
      contract.reserveToken(),
    ]);

    let totalEthVolume = 0;
    for (const swap of swapsToInsert) {
      totalEthVolume += parseFloat(swap.eth_in) + parseFloat(swap.eth_out);
    }

    const { data: currentToken } = await supabase
      .from("tokens")
      .select("total_volume_eth")
      .eq("token_address", token.token_address)
      .maybeSingle();

    const currentVolume = parseFloat(currentToken?.total_volume_eth || "0");
    const newVolume = (currentVolume + totalEthVolume).toString();

    await supabase
      .from("tokens")
      .update({
        current_eth_reserve: ethers.formatEther(reserveETH),
        current_token_reserve: ethers.formatEther(reserveToken),
        total_volume_eth: newVolume,
        last_checked_block: Math.max(endBlock, token.last_checked_block || 0),
      })
      .eq("token_address", token.token_address);

    // Update activity tracking
    const mostRecentSwap = swapsToInsert[swapsToInsert.length - 1];
    await supabase.rpc('record_token_swap_activity', {
      token_addr: token.token_address,
      swap_timestamp: mostRecentSwap.created_at
    });

    // Create price snapshots for the most recent swap
    const { data: ethPriceData } = await supabase
      .from("eth_price_history")
      .select("price_usd")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ethPriceUsd = ethPriceData?.price_usd || 3000;
    const finalReserveEth = parseFloat(ethers.formatEther(reserveETH));
    const finalReserveToken = parseFloat(ethers.formatEther(reserveToken));
    const finalPriceEth = finalReserveEth / finalReserveToken;

    await supabase
      .from("price_snapshots")
      .upsert({
        token_address: token.token_address,
        price_eth: finalPriceEth.toString(),
        eth_reserve: ethers.formatEther(reserveETH),
        token_reserve: ethers.formatEther(reserveToken),
        created_at: mostRecentSwap.created_at,
        eth_price_usd: ethPriceUsd,
        is_interpolated: false,
        block_number: mostRecentSwap.block_number,
      }, {
        onConflict: "token_address,block_number",
      });

    const result = {
      token_address: token.token_address,
      symbol: token.symbol,
      name: token.name,
      block_range: { from: startBlock, to: endBlock },
      swaps_found: events.length,
      swaps_inserted: count || 0,
      volume_added_eth: totalEthVolume,
      execution_time_ms: Date.now() - startTime,
    };

    console.log(`Backfill complete for ${token.symbol}: ${result.swaps_inserted} swaps inserted`);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Error in backfill:", err);
    return new Response(
      JSON.stringify({
        error: err.message,
        execution_time_ms: Date.now() - startTime,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
