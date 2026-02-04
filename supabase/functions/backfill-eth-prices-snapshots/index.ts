import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Content-Type": "application/json",
};

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

    // Get the most recent ETH price from eth_price_history
    const { data: ethPriceData, error: ethPriceError } = await supabase
      .from("eth_price_history")
      .select("price_usd")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ethPriceError) {
      throw new Error(`Failed to fetch ETH price: ${ethPriceError.message}`);
    }

    const ethPriceUSD = ethPriceData ? parseFloat(ethPriceData.price_usd) : 2960.1;
    console.log(`Using ETH price: $${ethPriceUSD}`);

    // Process snapshots in batches
    let totalUpdated = 0;
    let batchSize = 500;
    let batchesProcessed = 0;
    const maxBatches = 50; // Limit to prevent timeout

    while (batchesProcessed < maxBatches) {
      // Get a batch of snapshots with incorrect prices (both 3300 and 2960.1)
      const { data: snapshotsToUpdate, error: fetchError } = await supabase
        .from("price_snapshots")
        .select("id")
        .or("eth_price_usd.eq.3300,eth_price_usd.eq.2960.1")
        .limit(batchSize);

      if (fetchError) {
        throw new Error(`Failed to fetch snapshots: ${fetchError.message}`);
      }

      if (!snapshotsToUpdate || snapshotsToUpdate.length === 0) {
        console.log("No more snapshots to update");
        break;
      }

      // Update this batch
      const ids = snapshotsToUpdate.map(s => s.id);
      const { error: updateError } = await supabase
        .from("price_snapshots")
        .update({ eth_price_usd: ethPriceUSD })
        .in("id", ids);

      if (updateError) {
        throw new Error(`Failed to update snapshots: ${updateError.message}`);
      }

      totalUpdated += snapshotsToUpdate.length;
      batchesProcessed++;

      console.log(`Batch ${batchesProcessed}: Updated ${snapshotsToUpdate.length} snapshots (total: ${totalUpdated})`);

      // If we got fewer rows than the batch size, we're done
      if (snapshotsToUpdate.length < batchSize) {
        break;
      }
    }

    // Check if there are more remaining
    const { count: remainingCount } = await supabase
      .from("price_snapshots")
      .select("id", { count: "exact", head: true })
      .or("eth_price_usd.eq.3300,eth_price_usd.eq.2960.1");

    return new Response(
      JSON.stringify({
        success: true,
        totalUpdated,
        batchesProcessed,
        ethPriceUsed: ethPriceUSD,
        remainingToUpdate: remainingCount || 0,
        message: remainingCount && remainingCount > 0
          ? `Processed ${totalUpdated} snapshots. ${remainingCount} remaining - call function again to continue.`
          : `Backfill complete! Updated ${totalUpdated} snapshots.`
      }),
      {
        headers: corsHeaders,
      }
    );
  } catch (err: any) {
    console.error("Error in backfill-eth-prices-snapshots:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});
