import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FACTORY_ADDRESS = "0xDE377c1C3280C2De18479Acbe40a06a79E0B3831";

const FACTORY_ABI = [
  "event TokenLaunched(address indexed tokenAddress, address indexed ammAddress, string name, string symbol, address indexed creator, uint256 liquidityPercent, uint256 initialLiquidityETH)"
];

const AMM_ABI = [
  "event Swap(address indexed user, uint256 ethIn, uint256 tokenIn, uint256 ethOut, uint256 tokenOut)",
  "function reserveToken() external view returns (uint256)",
  "function reserveETH() external view returns (uint256)"
];

const RPC_PROVIDERS = [
  Deno.env.get("ETHEREUM_RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
  "https://rpc2.sepolia.org",
];

const MIN_BLOCK_RANGE = 100;
const MAX_BLOCK_RANGE = 2000; // Allow larger ranges when catching up
const MAX_EXECUTION_TIME_MS = 23000;
const PARALLEL_TOKEN_LIMIT = 6; // Balance between speed and rate limits

// Calculate adaptive block range based on how far behind we are
function calculateBlockRange(blocksBehind: number): number {
  if (blocksBehind > 10000) {
    return MAX_BLOCK_RANGE; // Maximum speed when very behind
  } else if (blocksBehind > 5000) {
    return 1000;
  } else if (blocksBehind > 1000) {
    return 500;
  } else if (blocksBehind > 500) {
    return 300;
  } else {
    return MIN_BLOCK_RANGE; // Slower when caught up for better accuracy
  }
}

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

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if it's a rate limit error
      const isRateLimitError = error?.message?.includes('429') ||
                               error?.message?.includes('rate limit') ||
                               error?.message?.toLowerCase().includes('too many requests') ||
                               error?.code === 429 ||
                               error?.code === -32005; // JSON-RPC rate limit code

      // Check if it's a timeout or connection error
      const isConnectionError = error?.message?.includes('timeout') ||
                                error?.message?.includes('ETIMEDOUT') ||
                                error?.message?.includes('ECONNRESET') ||
                                error?.code === 'TIMEOUT';

      if (isRateLimitError && i < maxRetries - 1) {
        // For rate limit errors, wait much longer and try next provider
        const delay = Math.min(initialDelay * Math.pow(3, i), 60000);
        console.log(`Rate limit detected, waiting ${delay}ms before retry ${i + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Try switching provider on rate limit
        currentProviderIndex = (currentProviderIndex + 1) % RPC_PROVIDERS.length;
      } else if (isConnectionError && i < maxRetries - 1) {
        // For connection errors, try next provider immediately
        console.log(`Connection error, trying next provider (retry ${i + 1}/${maxRetries})`);
        currentProviderIndex = (currentProviderIndex + 1) % RPC_PROVIDERS.length;
        await new Promise(resolve => setTimeout(resolve, 500));
      } else if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

interface IndexRequest {
  fromBlock?: number;
  toBlock?: number;
  indexTokenLaunches?: boolean;
  indexSwaps?: boolean;
  skipReorgCheck?: boolean;
  backfillSwaps?: boolean;
}

class BlockCache {
  private cache: Map<number, ethers.Block> = new Map();

  async getBlock(provider: ethers.JsonRpcProvider, blockNumber: number): Promise<ethers.Block> {
    if (this.cache.has(blockNumber)) {
      return this.cache.get(blockNumber)!;
    }
    const block = await provider.getBlock(blockNumber);
    if (block) {
      this.cache.set(blockNumber, block);
    }
    return block!;
  }

  clear() {
    this.cache.clear();
  }
}

async function detectAndHandleReorg(
  supabase: any,
  provider: ethers.JsonRpcProvider,
  lastIndexedBlock: number,
  lastBlockHash: string | null
): Promise<{ reorgDetected: boolean; rollbackToBlock: number; error?: string }> {
  if (!lastBlockHash || lastIndexedBlock === 0) {
    return { reorgDetected: false, rollbackToBlock: lastIndexedBlock };
  }

  try {
    const currentBlock = await provider.getBlock(lastIndexedBlock);

    if (!currentBlock) {
      console.warn(`Block ${lastIndexedBlock} not found, chain may have reorged`);
      return { reorgDetected: true, rollbackToBlock: Math.max(0, lastIndexedBlock - 100) };
    }

    if (currentBlock.hash !== lastBlockHash) {
      console.warn(`Reorg detected! Block ${lastIndexedBlock} hash mismatch`);
      console.warn(`Stored: ${lastBlockHash}, Current: ${currentBlock.hash}`);

      let rollbackBlock = lastIndexedBlock - 1;
      while (rollbackBlock > Math.max(0, lastIndexedBlock - 100)) {
        const { data: blockData } = await supabase
          .from("tokens")
          .select("block_hash")
          .eq("block_number", rollbackBlock)
          .limit(1)
          .maybeSingle();

        if (blockData?.block_hash) {
          const chainBlock = await provider.getBlock(rollbackBlock);
          if (chainBlock && chainBlock.hash === blockData.block_hash) {
            return { reorgDetected: true, rollbackToBlock: rollbackBlock };
          }
        }
        rollbackBlock--;
      }

      return { reorgDetected: true, rollbackToBlock: Math.max(0, lastIndexedBlock - 100) };
    }

    return { reorgDetected: false, rollbackToBlock: lastIndexedBlock };
  } catch (err: any) {
    console.error("Error detecting reorg:", err);
    return { reorgDetected: false, rollbackToBlock: lastIndexedBlock, error: err.message };
  }
}

async function rollbackToBlock(supabase: any, blockNumber: number): Promise<{ deletedTokens: number; deletedSwaps: number; deletedSnapshots: number }> {
  console.log(`Rolling back data from blocks > ${blockNumber}`);

  const { data: tokensToDelete } = await supabase
    .from("tokens")
    .select("token_address")
    .gt("block_number", blockNumber);

  const deletedTokenAddresses = tokensToDelete?.map((t: any) => t.token_address) || [];

  const { count: deletedTokens } = await supabase
    .from("tokens")
    .delete({ count: "exact" })
    .gt("block_number", blockNumber);

  const { count: deletedSwaps } = await supabase
    .from("swaps")
    .delete({ count: "exact" })
    .gt("block_number", blockNumber);

  const { count: deletedSnapshots1 } = await supabase
    .from("price_snapshots")
    .delete({ count: "exact" })
    .gt("block_number", blockNumber);

  let deletedSnapshots2 = 0;
  if (deletedTokenAddresses.length > 0) {
    const { count: orphanedSnapshots } = await supabase
      .from("price_snapshots")
      .delete({ count: "exact" })
      .in("token_address", deletedTokenAddresses);
    deletedSnapshots2 = orphanedSnapshots || 0;
  }

  return {
    deletedTokens: deletedTokens || 0,
    deletedSwaps: deletedSwaps || 0,
    deletedSnapshots: (deletedSnapshots1 || 0) + deletedSnapshots2,
  };
}

async function processTokenSwaps(
  token: any,
  startBlock: number,
  endBlock: number,
  backfillSwaps: boolean,
  provider: ethers.JsonRpcProvider,
  supabase: any,
  blockCache: BlockCache,
  startTime: number
): Promise<{ swapsIndexed: number; errors: string[]; timedOut: boolean }> {
  const errors: string[] = [];
  let swapsIndexed = 0;
  let timedOut = false;

  try {
    if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
      return { swapsIndexed, errors, timedOut: true };
    }

    let queryStartBlock = startBlock;

    if (backfillSwaps) {
      const { data: earliestSwap } = await supabase
        .from("swaps")
        .select("block_number")
        .eq("token_address", token.token_address)
        .order("block_number", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!earliestSwap || earliestSwap.block_number > token.block_number + 1) {
        queryStartBlock = Math.max(token.block_number, startBlock);
      }
    }

    if (queryStartBlock > endBlock) {
      return { swapsIndexed, errors, timedOut };
    }

    const amm = new ethers.Contract(token.amm_address, AMM_ABI, provider);
    const filter = amm.filters.Swap();
    const events = await retryWithBackoff(() => amm.queryFilter(filter, queryStartBlock, endBlock));

    if (events.length === 0) {
      return { swapsIndexed, errors, timedOut };
    }

    const swapsToInsert: any[] = [];
    const uniqueBlocks = new Set<number>();

    for (const event of events) {
      if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
        timedOut = true;
        break;
      }

      const args = event.args!;
      uniqueBlocks.add(event.blockNumber);

      const block = await blockCache.getBlock(provider, event.blockNumber);

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

    if (swapsToInsert.length > 0) {
      const { error: swapError, count } = await supabase
        .from("swaps")
        .upsert(swapsToInsert, { onConflict: "tx_hash", count: "exact" });

      if (swapError) {
        errors.push(`Failed to insert swaps for ${token.token_address}: ${swapError.message}`);
      } else {
        swapsIndexed = count || 0;

        const lastEvent = events[events.length - 1];
        const [reserveETH, reserveToken] = await retryWithBackoff(() => Promise.all([
          amm.reserveETH(),
          amm.reserveToken(),
        ]));

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

        const ethReserveFormatted = ethers.formatEther(reserveETH);
        const tokenReserveFormatted = ethers.formatEther(reserveToken);

        await supabase
          .from("tokens")
          .update({
            current_eth_reserve: ethReserveFormatted,
            current_token_reserve: tokenReserveFormatted,
            total_volume_eth: newVolume,
          })
          .eq("token_address", token.token_address);

        const hasTokenSells = swapsToInsert.some(swap => parseFloat(swap.token_out) > 0);
        if (hasTokenSells) {
          await supabase.rpc('refresh_token_holder_count', {
            p_token_address: token.token_address
          });
        }
      }
    }
  } catch (err: any) {
    errors.push(`Failed to index swaps for ${token.token_address}: ${err.message}`);
  }

  return { swapsIndexed, errors, timedOut };
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
    return await processIndexing(req, startTime);
  } catch (err: any) {
    console.error("Error executing event-indexer:", err);
    return new Response(
      JSON.stringify({
        error: err.message,
        executionTimeMs: Date.now() - startTime
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

async function processIndexing(req: Request, startTime: number): Promise<Response> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const provider = await retryWithBackoff(() => createProviderWithFailover());
    const blockCache = new BlockCache();

    const {
      fromBlock,
      toBlock,
      indexTokenLaunches = true,
      indexSwaps = true,
      skipReorgCheck = false,
      backfillSwaps = false
    }: IndexRequest = await req.json().catch(() => ({}));

    const { data: indexerState } = await supabase
      .from("indexer_state")
      .select("*")
      .limit(1)
      .maybeSingle();

    const lastIndexedBlock = indexerState?.last_indexed_block || 0;
    const lastBlockHash = indexerState?.last_block_hash || null;
    const confirmationDepth = indexerState?.confirmation_depth || 2;

    const results = {
      tokensIndexed: 0,
      swapsIndexed: 0,
      errors: [] as string[],
      reorgDetected: false,
      rollbackData: null as any,
      fromBlock: 0,
      toBlock: 0,
      executionTimeMs: 0,
      timedOut: false,
    };

    // Skip reorg check temporarily to speed up catch-up
    // if (!skipReorgCheck && lastIndexedBlock > 0) {
    //   const reorgResult = await detectAndHandleReorg(supabase, provider, lastIndexedBlock, lastBlockHash);
    //   if (reorgResult.error) {
    //     results.errors.push(`Reorg detection error: ${reorgResult.error}`);
    //   }
    //   if (reorgResult.reorgDetected) {
    //     results.reorgDetected = true;
    //     const rollbackData = await rollbackToBlock(supabase, reorgResult.rollbackToBlock);
    //     results.rollbackData = rollbackData;
    //     await supabase
    //       .from("indexer_state")
    //       .update({
    //         last_indexed_block: reorgResult.rollbackToBlock,
    //         last_block_hash: null,
    //         updated_at: new Date().toISOString(),
    //       })
    //       .eq("id", indexerState.id);
    //     console.log(`Rolled back to block ${reorgResult.rollbackToBlock}`, rollbackData);
    //   }
    // }

    const currentBlock = await provider.getBlockNumber();
    const safeBlock = currentBlock - confirmationDepth;

    let startBlock = fromBlock !== undefined ? fromBlock : Math.max(lastIndexedBlock + 1, 0);

    if (startBlock === 0 || startBlock < (safeBlock - 100000)) {
      startBlock = Math.max(safeBlock - 10000, 0);
    }

    let endBlock = toBlock !== undefined ? toBlock : safeBlock;

    // Use adaptive block range based on how far behind we are
    const blocksBehind = safeBlock - startBlock;
    const adaptiveBlockRange = calculateBlockRange(blocksBehind);

    if (endBlock - startBlock > adaptiveBlockRange) {
      endBlock = startBlock + adaptiveBlockRange;
    }

    console.log(`Processing blocks ${startBlock} to ${endBlock} (${blocksBehind} blocks behind, using range: ${adaptiveBlockRange})`);

    if (startBlock > endBlock) {
      results.executionTimeMs = Date.now() - startTime;
      return new Response(
        JSON.stringify({
          ...results,
          message: "No new blocks to index",
          lastIndexedBlock,
          currentBlock,
          safeBlock,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    results.fromBlock = startBlock;
    results.toBlock = endBlock;

    let lastProcessedBlockNumber = startBlock;
    let lastProcessedBlockHash: string | null = null;

    if (indexTokenLaunches && FACTORY_ADDRESS !== "0x0000000000000000000000000000000000000000") {
      try {
        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        const filter = factory.filters.TokenLaunched();
        const events = await factory.queryFilter(filter, startBlock, endBlock);

        for (const event of events) {
          if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
            results.timedOut = true;
            break;
          }

          const args = event.args!;
          const block = await blockCache.getBlock(provider, event.blockNumber);

          const initialLiquidityEth = parseFloat(ethers.formatEther(args.initialLiquidityETH));
          const liquidityPercent = Number(args.liquidityPercent);
          const initialTokenReserve = 1000000 * liquidityPercent / 100;
          const launchPriceEth = initialLiquidityEth / initialTokenReserve;

          const { error } = await supabase
            .from("tokens")
            .upsert({
              token_address: args.tokenAddress.toLowerCase(),
              amm_address: args.ammAddress.toLowerCase(),
              name: args.name,
              symbol: args.symbol,
              creator_address: args.creator.toLowerCase(),
              liquidity_percent: liquidityPercent,
              initial_liquidity_eth: initialLiquidityEth.toString(),
              launch_price_eth: launchPriceEth.toString(),
              current_eth_reserve: initialLiquidityEth.toString(),
              current_token_reserve: initialTokenReserve.toString(),
              total_volume_eth: "0",
              created_at: new Date(block.timestamp * 1000).toISOString(),
              block_number: block.number,
              block_hash: block.hash,
            }, {
              onConflict: "token_address",
            });

          if (error) {
            results.errors.push(`Failed to insert token ${args.tokenAddress}: ${error.message}`);
          } else {
            results.tokensIndexed++;
            lastProcessedBlockNumber = Math.max(lastProcessedBlockNumber, block.number);
            lastProcessedBlockHash = block.hash;

            try {
              const historyResponse = await fetch(`${supabaseUrl}/functions/v1/generate-initial-history`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  tokenAddress: args.tokenAddress.toLowerCase(),
                  initialPriceETH: launchPriceEth,
                  initialEthReserve: initialLiquidityEth,
                  initialTokenReserve: initialTokenReserve,
                  createdAt: new Date(block.timestamp * 1000).toISOString(),
                  hoursOfHistory: 24,
                }),
              });

              if (!historyResponse.ok) {
                const errorText = await historyResponse.text();
                console.error(`Failed to generate initial history for ${args.tokenAddress}: ${errorText}`);
              } else {
                const historyResult = await historyResponse.json();
                console.log(`Generated ${historyResult.snapshotsCreated} initial snapshots for ${args.tokenAddress}`);
              }
            } catch (historyErr: any) {
              console.error(`Error generating initial history for ${args.tokenAddress}:`, historyErr);
            }
          }
        }
      } catch (err: any) {
        results.errors.push(`Token launch indexing error: ${err.message}`);
      }
    }

    if (indexSwaps && !results.timedOut) {
      try {
        // Only query tokens that might have activity in this block range
        // Skip tokens created after our endBlock
        const { data: tokens } = await supabase
          .from("tokens")
          .select("token_address, amm_address, block_number")
          .lte("block_number", endBlock);

        if (tokens && tokens.length > 0) {
          console.log(`Processing swaps for ${tokens.length} tokens`);
          const processToken = async (token: any) => {
            return await processTokenSwaps(
              token,
              startBlock,
              endBlock,
              backfillSwaps,
              provider,
              supabase,
              blockCache,
              startTime
            );
          };

          for (let i = 0; i < tokens.length; i += PARALLEL_TOKEN_LIMIT) {
            if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
              results.timedOut = true;
              break;
            }

            const batch = tokens.slice(i, i + PARALLEL_TOKEN_LIMIT);
            const batchResults = await Promise.all(batch.map(processToken));

            for (const result of batchResults) {
              results.swapsIndexed += result.swapsIndexed;
              results.errors.push(...result.errors);
              if (result.timedOut) {
                results.timedOut = true;
              }
            }

            if (results.timedOut) {
              break;
            }

            // Small delay between batches to avoid overwhelming the RPC
            if (i + PARALLEL_TOKEN_LIMIT < tokens.length) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
        }
      } catch (err: any) {
        results.errors.push(`Swap indexing error: ${err.message}`);
      }
    }

    if (results.swapsIndexed > 0 || results.tokensIndexed > 0) {
      try {
        await supabase.rpc('update_platform_stats');
      } catch (err: any) {
        results.errors.push(`Failed to update platform stats: ${err.message}`);
      }

      if (!lastProcessedBlockHash) {
        const block = await blockCache.getBlock(provider, lastProcessedBlockNumber);
        lastProcessedBlockHash = block?.hash || null;
      }

      await supabase
        .from("indexer_state")
        .upsert({
          id: indexerState?.id || undefined,
          last_indexed_block: lastProcessedBlockNumber,
          last_block_hash: lastProcessedBlockHash,
          confirmation_depth: confirmationDepth,
          updated_at: new Date().toISOString(),
        });
    } else if (endBlock > lastIndexedBlock && !results.timedOut) {
      const block = await blockCache.getBlock(provider, endBlock);
      await supabase
        .from("indexer_state")
        .upsert({
          id: indexerState?.id || undefined,
          last_indexed_block: endBlock,
          last_block_hash: block?.hash || null,
          confirmation_depth: confirmationDepth,
          updated_at: new Date().toISOString(),
        });
    }

    blockCache.clear();
    results.executionTimeMs = Date.now() - startTime;

    // Add monitoring information
    const responseData = {
      ...results,
      blocksBehind: safeBlock - (lastProcessedBlockNumber || lastIndexedBlock),
      blocksProcessed: endBlock - startBlock,
      blockProcessingRate: Math.round((endBlock - startBlock) / (results.executionTimeMs / 1000)),
      currentBlock,
      safeBlock,
      lastIndexedBlock: lastProcessedBlockNumber || lastIndexedBlock,
    };

    console.log(`Indexing complete: ${responseData.tokensIndexed} tokens, ${responseData.swapsIndexed} swaps, ${responseData.blocksProcessed} blocks in ${responseData.executionTimeMs}ms`);
    console.log(`Still ${responseData.blocksBehind} blocks behind (rate: ${responseData.blockProcessingRate} blocks/sec)`);

    return new Response(
      JSON.stringify(responseData),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: any) {
    console.error("Error in event-indexer:", err);
    return new Response(
      JSON.stringify({
        error: err.message,
        executionTimeMs: Date.now() - startTime
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
}
