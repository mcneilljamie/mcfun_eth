import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";
import { getChainId, getRPCProviders } from "../_shared/config.ts";

const corsHeaders = {"Content-Type": "application/json"};
const CHAIN_ID = getChainId();
const AMM_ABI = ["function reserveToken() external view returns (uint256)","function reserveETH() external view returns (uint256)","function getPrice() external view returns (uint256)"];

const RPC_PROVIDERS = getRPCProviders();
let currentProviderIndex = 0;

async function createProviderWithFailover(): Promise<ethers.JsonRpcProvider> {
  for (let i = 0; i < RPC_PROVIDERS.length; i++) {
    const providerUrl = RPC_PROVIDERS[(currentProviderIndex + i) % RPC_PROVIDERS.length];
    try {
      const provider = new ethers.JsonRpcProvider(providerUrl);
      await provider.getBlockNumber();
      currentProviderIndex = (currentProviderIndex + i) % RPC_PROVIDERS.length;
      return provider;
    } catch (error) {
      console.error(`RPC provider ${providerUrl} failed`);
      continue;
    }
  }
  throw new Error("All RPC providers failed");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") { return new Response(null, { status: 200, headers: corsHeaders }); }
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get current ETH price from eth_price_history table
    let ethPriceUSD = 3300; // Default fallback
    const { data: ethPriceData, error: ethPriceError } = await supabase
      .from("eth_price_history")
      .select("price_usd")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ethPriceError) {
      console.error("Error fetching ETH price:", ethPriceError);
    } else if (ethPriceData) {
      ethPriceUSD = parseFloat(ethPriceData.price_usd);
      console.log(`Using current ETH price: $${ethPriceUSD}`);
    } else {
      console.warn("No ETH price found in database, using fallback: $3300");
    }

    const provider = await createProviderWithFailover();
    const currentBlockNumber = await provider.getBlockNumber();
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: recentSwaps } = await supabase.from("swaps").select("token_address").eq("chain_id", CHAIN_ID).gte("created_at", fortyEightHoursAgo);
    const activeTokenAddresses = new Set(recentSwaps?.map(s => s.token_address) || []);
    if (activeTokenAddresses.size === 0) {
      return new Response(JSON.stringify({message: "No active tokens", snapshotsCreated: 0}), { headers: corsHeaders });
    }
    const { data: tokens } = await supabase.from("tokens").select(`token_address, amm_address, symbol`).eq("chain_id", CHAIN_ID).in("token_address", Array.from(activeTokenAddresses));
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({message: "No tokens found", snapshotsCreated: 0}), { headers: corsHeaders });
    }
    const snapshots = [];
    for (const token of tokens) {
      try {
        const amm = new ethers.Contract(token.amm_address, AMM_ABI, provider);
        const [reserveETH, reserveToken, price] = await Promise.all([amm.reserveETH(), amm.reserveToken(), amm.getPrice()]);
        const ethReserveFormatted = ethers.formatEther(reserveETH);
        const tokenReserveFormatted = ethers.formatEther(reserveToken);
        const priceFormatted = ethers.formatEther(price);
        if (ethReserveFormatted !== "0.0" && tokenReserveFormatted !== "0.0") {
          const { data: lastSnapshot } = await supabase
            .from("price_snapshots")
            .select("price_eth")
            .eq("token_address", token.token_address)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const shouldCreateSnapshot = !lastSnapshot ||
            Math.abs((parseFloat(priceFormatted) - parseFloat(lastSnapshot.price_eth)) / parseFloat(lastSnapshot.price_eth)) > 0.001;

          if (shouldCreateSnapshot) {
            snapshots.push({
              chain_id: CHAIN_ID,
              token_address: token.token_address,
              price_eth: priceFormatted,
              eth_reserve: ethReserveFormatted,
              token_reserve: tokenReserveFormatted,
              eth_price_usd: ethPriceUSD,
              is_interpolated: false,
              block_number: currentBlockNumber,
              created_at: new Date().toISOString(),
            });
          }
          await supabase.from("tokens").update({
            current_eth_reserve: ethReserveFormatted,
            current_token_reserve: tokenReserveFormatted,
          }).eq("token_address", token.token_address);
        }
      } catch (err) { console.error(`Error for ${token.symbol}:`, err); }
    }
    if (snapshots.length > 0) {
      await supabase.from("price_snapshots").upsert(snapshots, { onConflict: 'token_address,block_number', ignoreDuplicates: false });
    }
    return new Response(JSON.stringify({snapshotsCreated: snapshots.length, tokensProcessed: tokens.length, timestamp: new Date().toISOString()}), { headers: corsHeaders });
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({error: err.message}), { status: 500, headers: corsHeaders });
  }
});
