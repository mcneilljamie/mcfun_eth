import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";
import { verifyCronSecret, createUnauthorizedResponse } from "../_shared/auth.ts";

const corsHeaders = {"Content-Type": "application/json"};
const FACTORY_ADDRESS = "0xDE377c1C3280C2De18479Acbe40a06a79E0B3831";
const FACTORY_ABI = ["event TokenLaunched(address indexed tokenAddress, address indexed ammAddress, string name, string symbol, address indexed creator, uint256 liquidityPercent, uint256 initialLiquidityETH)"];
const AMM_ABI = ["event Swap(address indexed user, uint256 ethIn, uint256 tokenIn, uint256 ethOut, uint256 tokenOut)","function reserveToken() external view returns (uint256)","function reserveETH() external view returns (uint256)"];
const RPC_PROVIDERS = [Deno.env.get("ETHEREUM_RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com","https://rpc.sepolia.org"];
const MIN_BLOCK_RANGE = 100;
const MAX_BLOCK_RANGE = 2000;
const MAX_EXECUTION_TIME_MS = 55000;

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
      console.error(`RPC provider ${providerUrl} failed, trying next...`, error);
      continue;
    }
  }
  throw new Error("All RPC providers failed");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") { return new Response(null, { status: 200, headers: corsHeaders }); }
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    console.warn("Unauthorized:", authResult.error);
    return createUnauthorizedResponse(authResult.error || "Unauthorized", authResult.statusCode, corsHeaders);
  }
  const startTime = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const provider = await createProviderWithFailover();
    const { data: indexerState } = await supabase.from("indexer_state").select("*").limit(1).maybeSingle();
    const lastIndexedBlock = indexerState?.last_indexed_block || 0;
    const currentBlock = await provider.getBlockNumber();
    const safeBlock = currentBlock - 2;
    let startBlock = Math.max(lastIndexedBlock + 1, safeBlock - 2000);
    let endBlock = Math.min(startBlock + 500, safeBlock);
    if (startBlock > endBlock) {
      return new Response(JSON.stringify({message: "No new blocks"}), { headers: corsHeaders });
    }
    const { data: tokens } = await supabase.from("tokens").select("token_address, amm_address").limit(50);
    let swapsIndexed = 0;
    if (tokens) {
      for (const token of tokens) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) break;
        try {
          const amm = new ethers.Contract(token.amm_address, AMM_ABI, provider);
          const events = await amm.queryFilter(amm.filters.Swap(), startBlock, endBlock);
          if (events.length > 0) {
            const swaps = [];
            for (const event of events) {
              const block = await provider.getBlock(event.blockNumber);
              swaps.push({
                token_address: token.token_address,
                amm_address: token.amm_address,
                user_address: event.args!.user.toLowerCase(),
                eth_in: ethers.formatEther(event.args!.ethIn),
                token_in: ethers.formatEther(event.args!.tokenIn),
                eth_out: ethers.formatEther(event.args!.ethOut),
                token_out: ethers.formatEther(event.args!.tokenOut),
                tx_hash: event.transactionHash,
                created_at: new Date(block!.timestamp * 1000).toISOString(),
                block_number: block!.number,
                block_hash: block!.hash,
              });
            }
            await supabase.from("swaps").upsert(swaps, { onConflict: "tx_hash" });
            swapsIndexed += swaps.length;
            const [reserveETH, reserveToken] = await Promise.all([amm.reserveETH(), amm.reserveToken()]);
            await supabase.from("tokens").update({
              current_eth_reserve: ethers.formatEther(reserveETH),
              current_token_reserve: ethers.formatEther(reserveToken),
            }).eq("token_address", token.token_address);
          }
        } catch (err) { console.error(`Error indexing ${token.token_address}:`, err); }
      }
    }
    await supabase.from("indexer_state").upsert({
      id: indexerState?.id,
      last_indexed_block: endBlock,
      updated_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({swapsIndexed, fromBlock: startBlock, toBlock: endBlock}), { headers: corsHeaders });
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({error: err.message}), { status: 500, headers: corsHeaders });
  }
});
