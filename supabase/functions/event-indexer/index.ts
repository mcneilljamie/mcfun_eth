import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";
import { getFactoryAddress, getRPCProviders, getChainConfig } from "../_shared/config.ts";

const corsHeaders = {"Content-Type": "application/json"};

const FACTORY_ABI = ["event TokenLaunched(address indexed tokenAddress, address indexed ammAddress, string name, string symbol, address indexed creator, uint256 liquidityPercent, uint256 initialLiquidityETH)"];
const AMM_ABI = ["event Swap(address indexed user, uint256 ethIn, uint256 tokenIn, uint256 ethOut, uint256 tokenOut)","function reserveToken() external view returns (uint256)","function reserveETH() external view returns (uint256)"];
const MIN_BLOCK_RANGE = 100;
const MAX_BLOCK_RANGE = 5000;
const MAX_EXECUTION_TIME_MS = 55000;

const providerIndexMap = new Map<number, number>();

async function createProviderWithFailover(chainId: number): Promise<ethers.JsonRpcProvider> {
  const RPC_PROVIDERS = getRPCProviders(chainId);
  const currentProviderIndex = providerIndexMap.get(chainId) || 0;

  for (let i = 0; i < RPC_PROVIDERS.length; i++) {
    const providerUrl = RPC_PROVIDERS[(currentProviderIndex + i) % RPC_PROVIDERS.length];
    try {
      const provider = new ethers.JsonRpcProvider(providerUrl);
      await provider.getBlockNumber();
      providerIndexMap.set(chainId, (currentProviderIndex + i) % RPC_PROVIDERS.length);
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
  const startTime = Date.now();
  try {
    const url = new URL(req.url);
    const chainId = parseInt(url.searchParams.get("chain_id") || "1");
    const chainConfig = getChainConfig(chainId);

    console.log(`Starting indexer for ${chainConfig.CHAIN_NAME} (chain ID: ${chainId})`);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const provider = await createProviderWithFailover(chainId);
    const { data: indexerState } = await supabase
      .from("indexer_state")
      .select("*")
      .eq("chain_id", chainId)
      .limit(1)
      .maybeSingle();
    const lastIndexedBlock = indexerState?.last_indexed_block || 0;
    const currentBlock = await provider.getBlockNumber();
    const safeBlock = currentBlock - 2;
    const blocksBehind = safeBlock - lastIndexedBlock;

    let blockRange: number;
    if (blocksBehind > 10000) {
      blockRange = MAX_BLOCK_RANGE;
      console.log(`Adaptive mode: ${blocksBehind} blocks behind, using ${MAX_BLOCK_RANGE} block range`);
    } else if (blocksBehind > 5000) {
      blockRange = 3000;
      console.log(`Adaptive mode: ${blocksBehind} blocks behind, using 3000 block range`);
    } else if (blocksBehind > 2000) {
      blockRange = 2000;
      console.log(`Adaptive mode: ${blocksBehind} blocks behind, using 2000 block range`);
    } else if (blocksBehind > 500) {
      blockRange = 1000;
      console.log(`Adaptive mode: ${blocksBehind} blocks behind, using 1000 block range`);
    } else {
      blockRange = 500;
    }

    let startBlock = Math.max(lastIndexedBlock + 1, safeBlock - blockRange);
    let endBlock = Math.min(startBlock + blockRange, safeBlock);
    if (startBlock > endBlock) {
      return new Response(JSON.stringify({message: "No new blocks", blocksBehind: 0, chainId}), { headers: corsHeaders });
    }

    const { data: tokens } = await supabase
      .from("tokens")
      .select("token_address, amm_address")
      .eq("chain_id", chainId);
    let swapsIndexed = 0;
    let tokensProcessed = 0;
    const blockCache = new Map<number, any>();

    if (tokens && tokens.length > 0) {
      const PARALLEL_BATCH_SIZE = 5;

      for (let i = 0; i < tokens.length; i += PARALLEL_BATCH_SIZE) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          console.log(`Timeout approaching, processed ${tokensProcessed}/${tokens.length} tokens`);
          break;
        }

        const batch = tokens.slice(i, i + PARALLEL_BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(async (token) => {
            try {
              const amm = new ethers.Contract(token.amm_address, AMM_ABI, provider);
              const events = await amm.queryFilter(amm.filters.Swap(), startBlock, endBlock);
              if (events.length > 0) {
                const swaps = [];
                for (const event of events) {
                  let block = blockCache.get(event.blockNumber);
                  if (!block) {
                    block = await provider.getBlock(event.blockNumber);
                    blockCache.set(event.blockNumber, block);
                  }
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
                    chain_id: chainId,
                  });
                }
                await supabase.from("swaps").upsert(swaps, { onConflict: "tx_hash" });
                const [reserveETH, reserveToken] = await Promise.all([amm.reserveETH(), amm.reserveToken()]);
                await supabase.from("tokens").update({
                  current_eth_reserve: ethers.formatEther(reserveETH),
                  current_token_reserve: ethers.formatEther(reserveToken),
                }).eq("token_address", token.token_address).eq("chain_id", chainId);

                // Create price snapshots for each swap using historical ETH price
                for (const swap of swaps) {
                  try {
                    // Get ETH price at the time of this swap
                    const { data: ethPriceData } = await supabase
                      .from("eth_price_history")
                      .select("price_usd")
                      .lte("timestamp", swap.created_at)
                      .order("timestamp", { ascending: false })
                      .limit(1)
                      .maybeSingle();

                    if (!ethPriceData?.price_usd) {
                      console.error(`No ETH price found for swap at ${swap.created_at}, skipping snapshot for ${swap.tx_hash}`);
                      continue;
                    }

                    const ethPriceUsd = parseFloat(ethPriceData.price_usd);

                    // Calculate price after this swap
                    const { data: tokenData } = await supabase
                      .from("tokens")
                      .select("current_eth_reserve, current_token_reserve")
                      .eq("token_address", token.token_address)
                      .eq("chain_id", chainId)
                      .maybeSingle();

                    if (tokenData) {
                      const priceEth = parseFloat(tokenData.current_eth_reserve) / parseFloat(tokenData.current_token_reserve);

                      await supabase.from("price_snapshots").upsert({
                        token_address: token.token_address,
                        price_eth: priceEth.toString(),
                        eth_reserve: tokenData.current_eth_reserve,
                        token_reserve: tokenData.current_token_reserve,
                        eth_price_usd: ethPriceUsd,
                        is_interpolated: false,
                        block_number: swap.block_number,
                        created_at: swap.created_at,
                        chain_id: chainId,
                      }, { onConflict: "token_address,block_number" });
                    }
                  } catch (err) {
                    console.error(`Failed to create snapshot for swap ${swap.tx_hash}:`, err);
                  }
                }

                return { swaps: swaps.length, token: token.token_address };
              }
              return { swaps: 0, token: token.token_address };
            } catch (err) {
              console.error(`Error indexing ${token.token_address}:`, err);
              return { swaps: 0, token: token.token_address, error: err };
            }
          })
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            swapsIndexed += result.value.swaps;
            tokensProcessed++;
          }
        }
      }
    }

    const processingTimeMs = Date.now() - startTime;
    const blocksProcessed = endBlock - startBlock + 1;
    const blocksPerSecond = (blocksProcessed / (processingTimeMs / 1000)).toFixed(2);

    await supabase.from("indexer_state").upsert({
      id: indexerState?.id,
      last_indexed_block: endBlock,
      updated_at: new Date().toISOString(),
      chain_id: chainId,
    });

    console.log(`[${chainConfig.CHAIN_NAME}] Indexed ${swapsIndexed} swaps from ${tokensProcessed} tokens, blocks ${startBlock}-${endBlock} (${blocksProcessed} blocks in ${processingTimeMs}ms, ${blocksPerSecond} blocks/sec)`);

    return new Response(JSON.stringify({
      chainId,
      chainName: chainConfig.CHAIN_NAME,
      swapsIndexed,
      tokensProcessed,
      fromBlock: startBlock,
      toBlock: endBlock,
      blocksBehind: safeBlock - endBlock,
      blocksPerSecond,
      processingTimeMs,
      blockRangeUsed: blockRange
    }), { headers: corsHeaders });
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({error: err.message}), { status: 500, headers: corsHeaders });
  }
});