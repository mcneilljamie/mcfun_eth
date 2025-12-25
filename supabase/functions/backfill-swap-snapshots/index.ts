import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { withLock } from "../_shared/lockManager.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    return await withLock("backfill_lock", async () => {
      return await processBackfillSwapSnapshots(req);
    }, {
      timeoutSeconds: 600,
      autoRenew: true,
      renewIntervalMs: 60000,
    });
  } catch (err: any) {
    console.error("Error acquiring lock or executing backfill-swap-snapshots:", err);
    return new Response(
      JSON.stringify({
        error: err.message,
        message: err.message.includes("Failed to acquire lock")
          ? "A backfill operation is already running. This request will be retried automatically."
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

async function processBackfillSwapSnapshots(req: Request): Promise<Response> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { tokenAddress } = await req.json().catch(() => ({}));

    if (!tokenAddress) {
      return new Response(
        JSON.stringify({ error: "tokenAddress is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const results = {
      snapshotsCreated: 0,
      errors: [] as string[],
      swapsProcessed: 0,
    };

    // Get token info
    const { data: token } = await supabase
      .from("tokens")
      .select("initial_liquidity_eth, liquidity_percent, launch_price_eth")
      .eq("token_address", tokenAddress)
      .maybeSingle();

    if (!token) {
      throw new Error("Token not found");
    }

    // Get all swaps for this token in chronological order
    const { data: swaps, error: swapsError } = await supabase
      .from("swaps")
      .select("*")
      .eq("token_address", tokenAddress)
      .order("block_number", { ascending: true });

    if (swapsError) {
      throw new Error(`Failed to fetch swaps: ${swapsError.message}`);
    }

    if (!swaps || swaps.length === 0) {
      return new Response(
        JSON.stringify({ message: "No swaps found", ...results }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get ETH price data
    const { data: ethPriceData } = await supabase
      .from("eth_price_history")
      .select("price_usd")
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ethPriceUSD = ethPriceData?.price_usd || 3000;

    // Initialize reserves with launch values
    const liquidityPercent = token.liquidity_percent || 80;
    const initialTokenSupply = 1000000 * liquidityPercent / 100;
    let currentEthReserve = parseFloat(token.initial_liquidity_eth || "0");
    let currentTokenReserve = initialTokenSupply;

    const snapshotsToInsert = [];

    for (const swap of swaps) {
      try {
        // Check if snapshot already exists for this swap block
        const { data: existingSnapshot } = await supabase
          .from("price_snapshots")
          .select("id")
          .eq("token_address", tokenAddress)
          .eq("block_number", swap.block_number)
          .maybeSingle();

        if (existingSnapshot) {
          // Update reserves based on this swap for next iteration
          currentEthReserve += parseFloat(swap.eth_in || "0") - parseFloat(swap.eth_out || "0");
          currentTokenReserve += parseFloat(swap.token_in || "0") - parseFloat(swap.token_out || "0");
          continue;
        }

        // Apply swap to reserves
        currentEthReserve += parseFloat(swap.eth_in || "0") - parseFloat(swap.eth_out || "0");
        currentTokenReserve += parseFloat(swap.token_in || "0") - parseFloat(swap.token_out || "0");

        // Skip if reserves are invalid
        if (currentEthReserve <= 0 || currentTokenReserve <= 0) {
          results.errors.push(`Invalid reserves after swap ${swap.tx_hash}`);
          continue;
        }

        const priceEth = currentEthReserve / currentTokenReserve;

        snapshotsToInsert.push({
          token_address: tokenAddress,
          price_eth: priceEth.toString(),
          eth_reserve: currentEthReserve.toString(),
          token_reserve: currentTokenReserve.toString(),
          eth_price_usd: ethPriceUSD,
          is_interpolated: false,
          block_number: swap.block_number,
          created_at: swap.created_at,
        });

        results.swapsProcessed++;

        // Insert in batches of 50 to avoid memory issues
        if (snapshotsToInsert.length >= 50) {
          const { error: insertError } = await supabase
            .from("price_snapshots")
            .insert(snapshotsToInsert);

          if (insertError) {
            results.errors.push(`Failed to insert batch: ${insertError.message}`);
          } else {
            results.snapshotsCreated += snapshotsToInsert.length;
          }
          snapshotsToInsert.length = 0;
        }
      } catch (err: any) {
        results.errors.push(`Failed to process swap ${swap.tx_hash}: ${err.message}`);
      }
    }

    // Insert remaining snapshots
    if (snapshotsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("price_snapshots")
        .insert(snapshotsToInsert);

      if (insertError) {
        results.errors.push(`Failed to insert final batch: ${insertError.message}`);
      } else {
        results.snapshotsCreated += snapshotsToInsert.length;
      }
    }

    return new Response(
      JSON.stringify(results),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Error in backfill-swap-snapshots:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}