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
];

const RPC_URL = Deno.env.get("ETHEREUM_RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com";

interface GapDetectionResult {
  token_address: string;
  amm_address: string;
  name: string;
  symbol: string;
  gaps_found: number;
  missing_swaps: number;
  gaps: Array<{
    start_block: number;
    end_block: number;
    on_chain_swaps: number;
    database_swaps: number;
    missing: number;
  }>;
}

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
      check_all = false,
      max_tokens = 10,
      block_range_size = 1000
    } = await req.json().catch(() => ({}));

    const results: GapDetectionResult[] = [];
    let tokens: any[] = [];

    if (token_address) {
      // Check specific token
      const { data } = await supabase
        .from("tokens")
        .select("token_address, amm_address, name, symbol, block_number, last_checked_block")
        .eq("token_address", token_address.toLowerCase())
        .maybeSingle();

      if (data) tokens = [data];
    } else if (check_all) {
      // Check tokens with recent activity (most likely to have missed swaps)
      const { data } = await supabase
        .from("tokens")
        .select("token_address, amm_address, name, symbol, block_number, last_checked_block")
        .order("last_swap_at", { ascending: false, nullsFirst: false })
        .limit(max_tokens);

      tokens = data || [];
    }

    console.log(`Checking ${tokens.length} tokens for missing swaps...`);

    for (const token of tokens) {
      try {
        const gaps: GapDetectionResult["gaps"] = [];
        let totalMissing = 0;

        // Get current blockchain height
        const currentBlock = await provider.getBlockNumber();
        const tokenStartBlock = token.block_number;
        const tokenLastChecked = token.last_checked_block || currentBlock;

        // Divide the range into chunks and check each
        for (let start = tokenStartBlock; start < tokenLastChecked; start += block_range_size) {
          const end = Math.min(start + block_range_size - 1, tokenLastChecked);

          // Query on-chain events
          const contract = new ethers.Contract(token.amm_address, AMM_ABI, provider);
          const filter = contract.filters.Swap();

          let onChainEvents = 0;
          try {
            const events = await contract.queryFilter(filter, start, end);
            onChainEvents = events.length;
          } catch (err) {
            console.error(`RPC failed for ${token.token_address} blocks ${start}-${end}:`, err);
            continue; // Skip this range if RPC fails
          }

          // Query database events
          const { count: dbEvents } = await supabase
            .from("swaps")
            .select("*", { count: "exact", head: true })
            .eq("token_address", token.token_address)
            .gte("block_number", start)
            .lte("block_number", end);

          const missing = onChainEvents - (dbEvents || 0);

          if (missing > 0) {
            gaps.push({
              start_block: start,
              end_block: end,
              on_chain_swaps: onChainEvents,
              database_swaps: dbEvents || 0,
              missing,
            });
            totalMissing += missing;
          }
        }

        if (gaps.length > 0) {
          results.push({
            token_address: token.token_address,
            amm_address: token.amm_address,
            name: token.name,
            symbol: token.symbol,
            gaps_found: gaps.length,
            missing_swaps: totalMissing,
            gaps,
          });

          console.log(`⚠️ Found ${totalMissing} missing swaps for ${token.symbol} (${token.token_address})`);
        }
      } catch (err: any) {
        console.error(`Error checking token ${token.token_address}:`, err.message);
      }
    }

    const summary = {
      tokens_checked: tokens.length,
      tokens_with_gaps: results.length,
      total_missing_swaps: results.reduce((sum, r) => sum + r.missing_swaps, 0),
      results,
      execution_time_ms: Date.now() - startTime,
    };

    console.log(`Gap detection complete: ${summary.tokens_with_gaps}/${summary.tokens_checked} tokens have gaps, ${summary.total_missing_swaps} missing swaps`);

    return new Response(
      JSON.stringify(summary),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: any) {
    console.error("Error in gap detection:", err);
    return new Response(
      JSON.stringify({
        error: err.message,
        execution_time_ms: Date.now() - startTime,
      }),
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
