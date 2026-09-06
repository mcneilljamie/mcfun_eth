import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";
import { getFactoryAddress, getRPCProviders, getChainConfig } from "../_shared/config.ts";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FACTORY_ABI = [
  "event TokenLaunched(address indexed tokenAddress, address indexed ammAddress, string name, string symbol, address indexed creator, uint256 liquidityPercent, uint256 initialLiquidityETH)"
];
const AMM_ABI = [
  "event Swap(address indexed user, uint256 ethIn, uint256 tokenIn, uint256 ethOut, uint256 tokenOut)",
  "function reserveToken() external view returns (uint256)",
  "function reserveETH() external view returns (uint256)"
];

const CONFIRMATION_DEPTH = 2;
const MAX_BLOCK_RANGE = 2000;
const MAX_EXECUTION_TIME_MS = 50000;
const RPC_TIMEOUT_MS = 5000;
// Safety net: every run we also re-scan this many blocks behind the committed
// cursor to recover any swaps that a transient RPC error dropped on a prior run.
const DEFAULT_LOOKBACK_BLOCKS = 600;

const providerIndexMap = new Map<number, number>();

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 400): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

async function createProviderWithFailover(chainId: number): Promise<ethers.JsonRpcProvider> {
  const RPC_PROVIDERS = getRPCProviders(chainId);
  const currentProviderIndex = providerIndexMap.get(chainId) || 0;

  for (let i = 0; i < RPC_PROVIDERS.length; i++) {
    const providerUrl = RPC_PROVIDERS[(currentProviderIndex + i) % RPC_PROVIDERS.length];
    try {
      const provider = new ethers.JsonRpcProvider(providerUrl, undefined, { staticNetwork: true });
      await Promise.race([
        provider.getBlockNumber(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`RPC timeout after ${RPC_TIMEOUT_MS}ms`)), RPC_TIMEOUT_MS)
        ),
      ]);
      providerIndexMap.set(chainId, (currentProviderIndex + i) % RPC_PROVIDERS.length);
      return provider;
    } catch (error) {
      console.error(`RPC provider ${providerUrl} failed, trying next...`, error);
      continue;
    }
  }
  throw new Error("All RPC providers failed");
}

async function getEthPriceAt(supabase: any, timestamp: string): Promise<number | null> {
  // First try to get the price from the history table
  const { data } = await supabase
    .from("eth_price_history")
    .select("price_usd")
    .lte("timestamp", timestamp)
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.price_usd) return parseFloat(data.price_usd);

  // If no price found, fetch from CoinGecko and store it
  try {
    const dateStr = timestamp.split('T')[0];
    const url = `https://api.coingecko.com/api/v3/coins/ethereum/history?date=${dateStr}&localization=false`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'McFunIndexer/1.0' },
    });
    if (!response.ok) return null;
    const cgData = await response.json();
    const price = cgData?.market_data?.current_price?.usd;
    if (!price || price <= 0) return null;

    // Store for future use
    await supabase
      .from("eth_price_history")
      .upsert({
        timestamp: `${dateStr}T00:00:00+00:00`,
        price_usd: price,
      }, { onConflict: 'timestamp' });

    console.log(`Fetched and stored ETH price for ${dateStr}: ${price}`);
    return price;
  } catch (err) {
    console.warn(`Failed to fetch ETH price from CoinGecko for ${timestamp}:`, err);
    return null;
  }
}

interface SwapRangeResult {
  swapsIndexed: number;
  snapshotsCreated: number;
  tokensProcessed: number;
  tokensFailed: number;
  timedOut: boolean;
}

// Scans every tracked token for Swap events in [fromBlock, toBlock] and upserts
// them (idempotent). Reserve/price reads are retried so a momentary RPC error no
// longer silently drops a trade. `updateReserves` refreshes each token's current
// reserves and should only be true for the live forward pass, not the lookback.
async function indexSwapsInRange(
  supabase: any,
  provider: ethers.JsonRpcProvider,
  tokens: any[],
  chainId: number,
  fromBlock: number,
  toBlock: number,
  startTime: number,
  updateReserves: boolean,
): Promise<SwapRangeResult> {
  let swapsIndexed = 0;
  let snapshotsCreated = 0;
  let tokensProcessed = 0;
  let tokensFailed = 0;
  let timedOut = false;

  if (fromBlock > toBlock) {
    return { swapsIndexed, snapshotsCreated, tokensProcessed, tokensFailed, timedOut };
  }

  for (const token of tokens) {
    if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
      console.log(`Timeout approaching after ${tokensProcessed}/${tokens.length} tokens, stopping`);
      timedOut = true;
      break;
    }

    try {
      const amm = new ethers.Contract(token.amm_address, AMM_ABI, provider);

      const events = await withRetry(() => amm.queryFilter(amm.filters.Swap(), fromBlock, toBlock));

      if (events.length === 0) {
        tokensProcessed++;
        continue;
      }

      const sortedEvents = events.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
        return a.index - b.index;
      });

      for (const event of sortedEvents) {
        try {
          const block = await withRetry(() => provider.getBlock(event.blockNumber));
          if (!block) continue;

          const blockTimestamp = new Date(block.timestamp * 1000).toISOString();
          const ethIn = event.args!.ethIn;
          const tokenIn = event.args!.tokenIn;
          const ethOut = event.args!.ethOut;
          const tokenOut = event.args!.tokenOut;

          const isBuy = ethIn > 0n && tokenOut > 0n;
          const tradeDirection = isBuy ? 'BUY' : 'SELL';

          // Read the post-trade reserves as of this swap's block.
          const [postTradeEthReserve, postTradeTokenReserve] = await withRetry(() => Promise.all([
            amm.reserveETH({ blockTag: event.blockNumber }),
            amm.reserveToken({ blockTag: event.blockNumber }),
          ]));

          const postEthFormatted = ethers.formatEther(postTradeEthReserve);
          const postTokenFormatted = ethers.formatEther(postTradeTokenReserve);
          const priceEth = parseFloat(postEthFormatted) / parseFloat(postTokenFormatted);

          const ethPriceUsd = await getEthPriceAt(supabase, blockTimestamp);
          if (!ethPriceUsd) {
            console.warn(`No ETH price for block ${event.blockNumber} at ${blockTimestamp}`);
          }

          const priceUsd = priceEth * (ethPriceUsd || 0);
          const marketCapUsd = priceUsd * 1000000;

          const swapRecord = {
            token_address: token.token_address,
            amm_address: token.amm_address,
            user_address: event.args!.user.toLowerCase(),
            eth_in: ethers.formatEther(ethIn),
            token_in: ethers.formatEther(tokenIn),
            eth_out: ethers.formatEther(ethOut),
            token_out: ethers.formatEther(tokenOut),
            tx_hash: event.transactionHash,
            transaction_index: event.transactionIndex,
            log_index: event.index,
            created_at: blockTimestamp,
            block_number: event.blockNumber,
            block_hash: block.hash,
            chain_id: chainId,
          };

          const { error: swapError } = await supabase
            .from("swaps")
            .upsert(swapRecord, { onConflict: 'chain_id,tx_hash,log_index' });

          if (swapError) {
            console.error(`Failed to upsert swap ${event.transactionHash}:${event.index}:`, swapError);
          }

          const snapshotRecord = {
            token_address: token.token_address,
            price_eth: priceEth.toString(),
            eth_reserve: postEthFormatted,
            token_reserve: postTokenFormatted,
            eth_price_usd: ethPriceUsd || 0,
            is_interpolated: false,
            block_number: event.blockNumber,
            created_at: blockTimestamp,
            chain_id: chainId,
            transaction_hash: event.transactionHash,
            transaction_index: event.transactionIndex,
            log_index: event.index,
            block_timestamp: blockTimestamp,
            trade_direction: tradeDirection,
            eth_amount: ethers.formatEther(ethIn > 0n ? ethIn : ethOut),
            token_amount: ethers.formatEther(tokenIn > 0n ? tokenIn : tokenOut),
            post_trade_eth_reserve: postEthFormatted,
            post_trade_token_reserve: postTokenFormatted,
            market_cap_usd: marketCapUsd,
            is_reconstructed: false,
          };

          const { error: snapError } = await supabase
            .from("price_snapshots")
            .upsert(snapshotRecord, { onConflict: 'chain_id,transaction_hash,log_index' });

          if (snapError) {
            console.error(`Failed to upsert snapshot for ${event.transactionHash}:${event.index}:`, snapError);
          } else {
            snapshotsCreated++;
          }

          swapsIndexed++;
        } catch (err) {
          console.error(`Error processing swap event:`, err);
        }
      }

      if (updateReserves) {
        const [reserveETH, reserveToken] = await withRetry(() => Promise.all([
          amm.reserveETH(),
          amm.reserveToken(),
        ]));
        await supabase.from("tokens").update({
          current_eth_reserve: ethers.formatEther(reserveETH),
          current_token_reserve: ethers.formatEther(reserveToken),
        }).eq("token_address", token.token_address).eq("chain_id", chainId);
      }

      tokensProcessed++;
    } catch (err) {
      // All retries for this token failed. Don't freeze the whole cursor for one
      // token's RPC failure — the lookback re-scan on a later run will recover any
      // swaps missed here once its RPC responds.
      console.error(`Error indexing ${token.token_address} (retries exhausted):`, err);
      tokensFailed++;
    }
  }

  return { swapsIndexed, snapshotsCreated, tokensProcessed, tokensFailed, timedOut };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  try {
    const url = new URL(req.url);
    const chainId = parseInt(url.searchParams.get("chain_id") || "1");
    const lookbackBlocks = parseInt(url.searchParams.get("lookback_blocks") || String(DEFAULT_LOOKBACK_BLOCKS));
    const chainConfig = getChainConfig(chainId);

    console.log(`Starting indexer for ${chainConfig.CHAIN_NAME} (chain ID: ${chainId})`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const provider = await createProviderWithFailover(chainId);

    // Get indexer state - cursor must NEVER skip blocks
    const { data: indexerState } = await supabase
      .from("indexer_state")
      .select("*")
      .eq("chain_id", chainId)
      .limit(1)
      .maybeSingle();

    const lastIndexedBlock = indexerState?.last_indexed_block || 0;
    const currentBlock = await provider.getBlockNumber();
    const safeBlock = currentBlock - CONFIRMATION_DEPTH;

    // CRITICAL: Always start from lastIndexedBlock + 1, never skip
    const startBlock = lastIndexedBlock + 1;
    const endBlock = Math.min(startBlock + MAX_BLOCK_RANGE - 1, safeBlock);

    const hasNewBlocks = startBlock <= endBlock;

    // Process token launches
    let tokensLaunched = 0;
    if (hasNewBlocks) {
      console.log(`Indexing blocks ${startBlock} to ${endBlock} (safe block: ${safeBlock}, behind: ${safeBlock - endBlock})`);
      try {
        const factoryAddress = getFactoryAddress(chainId);
        const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
        const launchEvents = await factory.queryFilter(factory.filters.TokenLaunched(), startBlock, endBlock);

        for (const event of launchEvents) {
          const block = await provider.getBlock(event.blockNumber);
          if (!block) continue;

          const tokenAddress = event.args!.tokenAddress.toLowerCase();
          const ammAddress = event.args!.ammAddress.toLowerCase();
          const liquidityPercent = Number(event.args!.liquidityPercent);
          const initialLiquidityETH = ethers.formatEther(event.args!.initialLiquidityETH);
          const initialTokenReserve = 1000000 * liquidityPercent / 100;
          const launchPriceEth = parseFloat(initialLiquidityETH) / initialTokenReserve;

          const ethPriceUsd = await getEthPriceAt(supabase, new Date(block.timestamp * 1000).toISOString());

          const { error } = await supabase.from("tokens").upsert({
            token_address: tokenAddress,
            amm_address: ammAddress,
            name: event.args!.name,
            symbol: event.args!.symbol,
            creator_address: event.args!.creator.toLowerCase(),
            liquidity_percent: liquidityPercent,
            initial_liquidity_eth: initialLiquidityETH,
            launch_price_eth: launchPriceEth,
            current_eth_reserve: initialLiquidityETH,
            current_token_reserve: initialTokenReserve,
            total_volume_eth: 0,
            created_at: new Date(block.timestamp * 1000).toISOString(),
            block_number: block.number,
            block_hash: block.hash,
            chain_id: chainId,
            launch_eth_price_usd: ethPriceUsd || null,
          }, { onConflict: "token_address,chain_id", ignoreDuplicates: true });

          if (!error) {
            tokensLaunched++;
            console.log(`[${chainConfig.CHAIN_NAME}] Registered token: ${event.args!.name} (${event.args!.symbol}) at block ${block.number}`);
          }
        }
      } catch (err) {
        console.error(`Error indexing token launches:`, err);
      }
    } else {
      console.log(`No new blocks to index (cursor ${lastIndexedBlock}, safe ${safeBlock}). Running lookback only.`);
    }

    // Get all tokens for this chain
    const { data: tokens } = await supabase
      .from("tokens")
      .select("token_address, amm_address")
      .eq("chain_id", chainId);

    const tokenList = tokens || [];

    // --- Forward pass: index the new block range ---
    let forward: SwapRangeResult = {
      swapsIndexed: 0, snapshotsCreated: 0, tokensProcessed: 0, tokensFailed: 0, timedOut: false,
    };
    if (hasNewBlocks && tokenList.length > 0) {
      forward = await indexSwapsInRange(
        supabase, provider, tokenList, chainId, startBlock, endBlock, startTime, true,
      );
    }

    // Advance the cursor when the forward range was fully scanned. A single token
    // whose RPC failed does NOT hold the cursor (that would let one bad token
    // freeze all indexing); the lookback re-scan below is the recovery mechanism.
    const cursorAdvanced = hasNewBlocks && !forward.timedOut;
    if (cursorAdvanced) {
      await supabase.from("indexer_state").upsert({
        id: indexerState?.id,
        last_indexed_block: endBlock,
        last_block_hash: null,
        confirmation_depth: CONFIRMATION_DEPTH,
        updated_at: new Date().toISOString(),
        chain_id: chainId,
      });
      console.log(`[${chainConfig.CHAIN_NAME}] Cursor advanced to ${endBlock}`);
    } else if (hasNewBlocks) {
      console.log(`[${chainConfig.CHAIN_NAME}] Timed out, cursor NOT advanced (stays at ${lastIndexedBlock})`);
    }

    // --- Lookback safety net: re-scan recently committed blocks to recover any
    // swaps a prior run dropped due to a transient RPC error. Idempotent upserts. ---
    let lookback: SwapRangeResult = {
      swapsIndexed: 0, snapshotsCreated: 0, tokensProcessed: 0, tokensFailed: 0, timedOut: false,
    };
    const lookbackEnd = lastIndexedBlock;
    const lookbackStart = Math.max(0, lastIndexedBlock - lookbackBlocks + 1);
    if (tokenList.length > 0 && lookbackEnd >= lookbackStart && Date.now() - startTime < MAX_EXECUTION_TIME_MS) {
      console.log(`[${chainConfig.CHAIN_NAME}] Lookback re-scan blocks ${lookbackStart} to ${lookbackEnd}`);
      lookback = await indexSwapsInRange(
        supabase, provider, tokenList, chainId, lookbackStart, lookbackEnd, startTime, false,
      );
    }

    const processingTimeMs = Date.now() - startTime;

    console.log(`[${chainConfig.CHAIN_NAME}] Forward: ${forward.swapsIndexed} swaps / ${tokensLaunched} launches. Lookback: ${lookback.swapsIndexed} recovered. (${processingTimeMs}ms)`);

    return new Response(JSON.stringify({
      chainId,
      chainName: chainConfig.CHAIN_NAME,
      tokensLaunched,
      swapsIndexed: forward.swapsIndexed,
      snapshotsCreated: forward.snapshotsCreated,
      tokensProcessed: forward.tokensProcessed,
      tokensFailed: forward.tokensFailed,
      fromBlock: startBlock,
      toBlock: endBlock,
      blocksBehind: safeBlock - endBlock,
      cursorAdvanced,
      timedOut: forward.timedOut,
      lookback: {
        fromBlock: lookbackStart,
        toBlock: lookbackEnd,
        swapsRecovered: lookback.swapsIndexed,
        tokensFailed: lookback.tokensFailed,
      },
      processingTimeMs,
    }), { headers: corsHeaders });
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
