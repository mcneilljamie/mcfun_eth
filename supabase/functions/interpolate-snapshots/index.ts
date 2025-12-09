import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Snapshot {
  created_at: string;
  price_eth: string;
  eth_reserve: string;
  token_reserve: string;
  eth_price_usd: number;
}

async function getEthPriceAtTime(supabase: any, timestamp: Date): Promise<number> {
  // Find the closest ETH price from eth_price_history
  const { data, error } = await supabase
    .from("eth_price_history")
    .select("price_usd, timestamp")
    .lte("timestamp", timestamp.toISOString())
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    // Try getting next closest if no previous exists
    const { data: nextData } = await supabase
      .from("eth_price_history")
      .select("price_usd")
      .gte("timestamp", timestamp.toISOString())
      .order("timestamp", { ascending: true })
      .limit(1)
      .maybeSingle();
    
    return nextData?.price_usd || 3000; // Fallback to default
  }

  return data.price_usd;
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

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const requestBody = await req.json().catch(() => ({}));
    const tokenAddress = requestBody.tokenAddress || null;
    const gapThresholdSeconds = requestBody.gapThreshold || 30; // Minimum gap to fill

    const results = {
      snapshotsCreated: 0,
      tokensProcessed: 0,
      errors: [] as string[],
    };

    // Get tokens to process
    let tokensQuery = supabase.from("tokens").select("token_address");
    if (tokenAddress) {
      tokensQuery = tokensQuery.eq("token_address", tokenAddress);
    }

    const { data: tokens, error: tokensError } = await tokensQuery;

    if (tokensError || !tokens) {
      throw new Error(`Failed to fetch tokens: ${tokensError?.message}`);
    }

    for (const token of tokens) {
      try {
        // Get all snapshots for this token, ordered by time
        const { data: snapshots, error: snapshotsError } = await supabase
          .from("price_snapshots")
          .select("created_at, price_eth, eth_reserve, token_reserve, eth_price_usd")
          .eq("token_address", token.token_address)
          .order("created_at", { ascending: true });

        if (snapshotsError || !snapshots || snapshots.length < 2) {
          continue; // Need at least 2 snapshots to find gaps
        }

        const interpolatedSnapshots = [];

        // Find gaps between consecutive snapshots
        for (let i = 0; i < snapshots.length - 1; i++) {
          const current = snapshots[i];
          const next = snapshots[i + 1];

          const currentTime = new Date(current.created_at).getTime();
          const nextTime = new Date(next.created_at).getTime();
          const gapSeconds = (nextTime - currentTime) / 1000;

          // If gap is larger than threshold, fill it with 15-second snapshots
          if (gapSeconds > gapThresholdSeconds) {
            const numInterpolated = Math.floor(gapSeconds / 15) - 1;

            for (let j = 1; j <= numInterpolated; j++) {
              const interpolatedTime = new Date(currentTime + (j * 15 * 1000));
              
              // Get ETH price at this time from historical data
              const ethPriceUsd = await getEthPriceAtTime(supabase, interpolatedTime);

              interpolatedSnapshots.push({
                token_address: token.token_address,
                created_at: interpolatedTime.toISOString(),
                price_eth: current.price_eth, // Keep token price same as previous
                eth_reserve: current.eth_reserve,
                token_reserve: current.token_reserve,
                eth_price_usd: ethPriceUsd,
                is_interpolated: true,
              });
            }
          }
        }

        // Batch insert interpolated snapshots
        if (interpolatedSnapshots.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < interpolatedSnapshots.length; i += batchSize) {
            const batch = interpolatedSnapshots.slice(i, i + batchSize);
            const { error: insertError } = await supabase
              .from("price_snapshots")
              .insert(batch);

            if (insertError) {
              results.errors.push(`Failed to insert batch for ${token.token_address}: ${insertError.message}`);
            } else {
              results.snapshotsCreated += batch.length;
            }
          }
        }

        results.tokensProcessed++;
      } catch (err: any) {
        results.errors.push(`Failed to process ${token.token_address}: ${err.message}`);
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
    console.error("Error in interpolate-snapshots:", err);
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