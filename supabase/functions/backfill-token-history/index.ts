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
      return await processBackfillTokenHistory(req);
    }, {
      timeoutSeconds: 600,
      autoRenew: true,
      renewIntervalMs: 60000,
    });
  } catch (err: any) {
    console.error("Error acquiring lock or executing backfill-token-history:", err);
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

async function processBackfillTokenHistory(req: Request): Promise<Response> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const requestBody = await req.json().catch(() => ({}));
    const minSnapshotsThreshold = requestBody.minSnapshots || 100;

    const results = {
      tokensProcessed: 0,
      tokensBackfilled: 0,
      errors: [] as string[],
    };

    const { data: tokens, error: tokensError } = await supabase
      .from("tokens")
      .select("token_address, initial_liquidity_eth, created_at");

    if (tokensError || !tokens) {
      throw new Error(`Failed to fetch tokens: ${tokensError?.message}`);
    }

    for (const token of tokens) {
      try {
        const { count } = await supabase
          .from("price_snapshots")
          .select("*", { count: "exact", head: true })
          .eq("token_address", token.token_address);

        if ((count || 0) < minSnapshotsThreshold) {
          const initialPriceETH = parseFloat(token.initial_liquidity_eth) / 1000000;

          const historyResponse = await fetch(`${supabaseUrl}/functions/v1/generate-initial-history`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              tokenAddress: token.token_address,
              initialPriceETH: initialPriceETH,
              initialEthReserve: parseFloat(token.initial_liquidity_eth),
              initialTokenReserve: 1000000,
              createdAt: token.created_at,
              hoursOfHistory: 24,
            }),
          });

          if (!historyResponse.ok) {
            const errorText = await historyResponse.text();
            results.errors.push(`Failed to backfill ${token.token_address}: ${errorText}`);
          } else {
            const historyResult = await historyResponse.json();
            console.log(`Backfilled ${historyResult.snapshotsCreated} snapshots for ${token.token_address}`);
            results.tokensBackfilled++;
          }
        }

        results.tokensProcessed++;
      } catch (err: any) {
        results.errors.push(`Error processing ${token.token_address}: ${err.message}`);
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
    console.error("Error in backfill-token-history:", err);
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