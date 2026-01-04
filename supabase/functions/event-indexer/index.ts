import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";
import { verifyCronSecret, createUnauthorizedResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Content-Type": "application/json",
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
const MAX_BLOCK_RANGE = 2000;
const MAX_EXECUTION_TIME_MS = 55000;
const PARALLEL_TOKEN_LIMIT = 15;
const BATCH_SIZE = 150;

function calculateBlockRange(blocksBehind: number): number {
  if (blocksBehind > 10000) {
    return MAX_BLOCK_RANGE;
  } else if (blocksBehind > 5000) {
    return 1000;
  } else if (blocksBehind > 1000) {
    return 500;
  } else if (blocksBehind > 500) {
    return 300;
  } else {
    return MIN_BLOCK_RANGE;
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

      const isRateLimitError = error?.message?.includes('429') ||
                               error?.message?.includes('rate limit') ||
                               error?.message?.toLowerCase().includes('too many requests') ||
                               error?.code === 429 ||
                               error?.code === -32005;

      const isConnectionError = error?.message?.includes('timeout') ||
                                error?.message?.includes('ETIMEDOUT') ||
                                error?.message?.includes('ECONNRESET') ||
                                error?.code === 'TIMEOUT';

      if (isRateLimitError && i < maxRetries - 1) {
        const delay = Math.min(initialDelay * Math.pow(3, i), 60000);
        console.log(`Rate limit detected, waiting ${delay}ms before retry ${i + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        currentProviderIndex = (currentProviderIndex + 1) % RPC_PROVIDERS.length;
      } else if (isConnectionError && i < maxRetries - 1) {
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    console.warn("Unauthorized access attempt to event-indexer");
    return createUnauthorizedResponse(
      authResult.error || "Unauthorized",
      authResult.statusCode,
      corsHeaders
    );
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const provider = await retryWithBackoff(() => createProviderWithFailover());

    const { data: indexerState } = await supabase
      .from("indexer_state")
      .select("*")
      .limit(1)
      .maybeSingle();

    const lastIndexedBlock = indexerState?.last_indexed_block || 0;
    const confirmationDepth = indexerState?.confirmation_depth || 2;

    const currentBlock = await provider.getBlockNumber();
    const safeBlock = currentBlock - confirmationDepth;

    let startBlock = Math.max(lastIndexedBlock + 1, 0);
    if (startBlock === 0 || startBlock < (safeBlock - 100000)) {
      startBlock = Math.max(safeBlock - 10000, 0);
    }

    const blocksBehind = safeBlock - startBlock;
    const adaptiveBlockRange = calculateBlockRange(blocksBehind);
    let endBlock = Math.min(startBlock + adaptiveBlockRange, safeBlock);

    console.log(`Processing blocks ${startBlock} to ${endBlock} (${blocksBehind} blocks behind)`);

    if (startBlock > endBlock) {
      return new Response(
        JSON.stringify({
          message: "No new blocks to index",
          lastIndexedBlock,
          currentBlock,
          safeBlock,
          executionTimeMs: Date.now() - startTime
        }),
        { headers: corsHeaders }
      );
    }

    let swapsIndexed = 0;
    let tokensIndexed = 0;

    const { data: tokens } = await supabase
      .from("tokens")
      .select("token_address, amm_address, block_number")
      .lte("block_number", endBlock)
      .limit(BATCH_SIZE);

    if (tokens && tokens.length > 0) {
      for (const token of tokens) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) break;

        try {
          const amm = new ethers.Contract(token.amm_address, AMM_ABI, provider);
          const filter = amm.filters.Swap();

          const tokenStartBlock = Math.max(token.block_number, startBlock);
          const events = await retryWithBackoff(() => amm.queryFilter(filter, tokenStartBlock, endBlock));

          if (events.length > 0) {
            const swapsToInsert = [];

            for (const event of events) {
              const args = event.args!;
              const block = await provider.getBlock(event.blockNumber);

              swapsToInsert.push({
                token_address: token.token_address,
                amm_address: token.amm_address,
                user_address: args.user.toLowerCase(),
                eth_in: ethers.formatEther(args.ethIn),
                token_in: ethers.formatEther(args.tokenIn),
                eth_out: ethers.formatEther(args.ethOut),
                token_out: ethers.formatEther(args.tokenOut),
                tx_hash: event.transactionHash,
                created_at: new Date(block!.timestamp * 1000).toISOString(),
                block_number: block!.number,
                block_hash: block!.hash,
              });
            }

            if (swapsToInsert.length > 0) {
              await supabase.from("swaps").upsert(swapsToInsert, { onConflict: "tx_hash" });
              swapsIndexed += swapsToInsert.length;

              const [reserveETH, reserveToken] = await retryWithBackoff(() => Promise.all([
                amm.reserveETH(),
                amm.reserveToken(),
              ]));

              await supabase
                .from("tokens")
                .update({
                  current_eth_reserve: ethers.formatEther(reserveETH),
                  current_token_reserve: ethers.formatEther(reserveToken),
                })
                .eq("token_address", token.token_address);
            }
          }
        } catch (err: any) {
          console.error(`Error indexing swaps for ${token.token_address}:`, err);
        }
      }
    }

    await supabase
      .from("indexer_state")
      .upsert({
        id: indexerState?.id,
        last_indexed_block: endBlock,
        last_block_hash: (await provider.getBlock(endBlock))?.hash || null,
        confirmation_depth: confirmationDepth,
        updated_at: new Date().toISOString(),
      });

    return new Response(
      JSON.stringify({
        swapsIndexed,
        tokensIndexed,
        fromBlock: startBlock,
        toBlock: endBlock,
        blocksBehind: safeBlock - endBlock,
        executionTimeMs: Date.now() - startTime
      }),
      { headers: corsHeaders }
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
        headers: corsHeaders,
      }
    );
  }
});
