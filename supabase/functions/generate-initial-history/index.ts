import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GenerateHistoryRequest {
  tokenAddress: string;
  initialPriceETH: number;
  initialEthReserve: number;
  initialTokenReserve: number;
  createdAt: string;
  hoursOfHistory?: number;
}

async function getEthPriceAtTime(supabase: any, timestamp: Date): Promise<number> {
  const { data, error } = await supabase
    .from("eth_price_history")
    .select("price_usd, timestamp")
    .lte("timestamp", timestamp.toISOString())
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    const { data: nextData } = await supabase
      .from("eth_price_history")
      .select("price_usd")
      .gte("timestamp", timestamp.toISOString())
      .order("timestamp", { ascending: true })
      .limit(1)
      .maybeSingle();

    return nextData?.price_usd || 3000;
  }

  return data.price_usd;
}

function generateRealisticPriceWalk(
  initialPrice: number,
  numPoints: number,
  maxDeviation: number = 0.3
): number[] {
  const prices: number[] = [initialPrice];
  let currentPrice = initialPrice;

  for (let i = 1; i < numPoints; i++) {
    const volatility = 0.02 + Math.random() * 0.03;
    const trend = (Math.random() - 0.5) * 2;
    const change = currentPrice * volatility * trend;

    currentPrice = currentPrice + change;

    const minPrice = initialPrice * (1 - maxDeviation);
    const maxPrice = initialPrice * (1 + maxDeviation);
    currentPrice = Math.max(minPrice, Math.min(maxPrice, currentPrice));

    prices.push(currentPrice);
  }

  const finalPrice = initialPrice;
  const priceGap = finalPrice - prices[prices.length - 1];
  const adjustmentPerPoint = priceGap / Math.min(10, numPoints);

  for (let i = Math.max(0, prices.length - 10); i < prices.length; i++) {
    const stepsFromEnd = prices.length - 1 - i;
    prices[i] += adjustmentPerPoint * stepsFromEnd;
  }

  return prices;
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

    const requestBody: GenerateHistoryRequest = await req.json();
    const {
      tokenAddress,
      initialPriceETH,
      initialEthReserve,
      initialTokenReserve,
      createdAt,
      hoursOfHistory = 24,
    } = requestBody;

    if (!tokenAddress || !initialPriceETH || !initialEthReserve || !initialTokenReserve) {
      throw new Error("Missing required parameters");
    }

    const results = {
      snapshotsCreated: 0,
      hoursGenerated: hoursOfHistory,
      errors: [] as string[],
    };

    const creationTime = new Date(createdAt);
    const now = new Date();
    const startTime = new Date(creationTime.getTime() - (hoursOfHistory * 60 * 60 * 1000));

    const intervalSeconds = 15;
    const totalPoints = Math.floor((hoursOfHistory * 60 * 60) / intervalSeconds);

    const priceWalk = generateRealisticPriceWalk(initialPriceETH, totalPoints, 0.25);

    const snapshots = [];

    for (let i = 0; i < totalPoints; i++) {
      const timestamp = new Date(startTime.getTime() + (i * intervalSeconds * 1000));

      if (timestamp >= now) break;

      const priceETH = priceWalk[i];
      const ethPriceUSD = await getEthPriceAtTime(supabase, timestamp);

      const reserveRatio = initialEthReserve / initialTokenReserve;
      const adjustedEthReserve = initialEthReserve * (0.95 + Math.random() * 0.1);
      const adjustedTokenReserve = adjustedEthReserve / priceETH;

      snapshots.push({
        token_address: tokenAddress,
        created_at: timestamp.toISOString(),
        price_eth: priceETH.toString(),
        eth_reserve: adjustedEthReserve.toString(),
        token_reserve: adjustedTokenReserve.toString(),
        eth_price_usd: ethPriceUSD,
        is_interpolated: true,
      });
    }

    const batchSize = 100;
    for (let i = 0; i < snapshots.length; i += batchSize) {
      const batch = snapshots.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from("price_snapshots")
        .insert(batch);

      if (insertError) {
        results.errors.push(`Failed to insert batch at index ${i}: ${insertError.message}`);
      } else {
        results.snapshotsCreated += batch.length;
      }
    }

    console.log(`Generated ${results.snapshotsCreated} historical snapshots for token ${tokenAddress}`);

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
    console.error("Error in generate-initial-history:", err);
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