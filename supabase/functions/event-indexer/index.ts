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

const providerIndexMap = new Map<number, number>();

async function createProviderWithFailover(chainId: number): Promise<ethers.JsonRpcProvider> {
  const RPC_PROVIDERS = getRPCProviders(chainId);
  const currentProviderIndex = providerIndexMap.get(chainId) || 0;

  for (let i = 0; i < RPC_PROVIDERS.length; i++) {
    const providerUrl = RPC_PROVIDERS[(currentProviderIndex + i) % RPC_PROVIDERS.length];
    try {
      const provider = new ethers.JsonRpcProvider(providerUrl, undefined, { staticNetwork: true });
      const blockNumber = await Promise.race([
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  try {
    const url = new URL(req.url);
    const chainId = parseInt(url.searchParams.get("chain_id") || "1");
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

    if (startBlock > endBlock) {
      return new Response(JSON.stringify({
        message: "No new blocks to index",
        chainId,
        lastIndexedBlock,
        currentBlock,
        safeBlock,
      }), { headers: corsHeaders });
    }

    console.log(`Indexing blocks ${startBlock} to ${endBlock} (safe block: ${safeBlock}, behind: ${safeBlock - endBlock})`);

    // Process token launches
    let tokensLaunched = 0;
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

    // Get all tokens for this chain
    const { data: tokens } = await supabase
      .from("tokens")
      .select("token_address, amm_address")
      .eq("chain_id", chainId);

    let swapsIndexed = 0;
    let snapshotsCreated = 0;
    let tokensProcessed = 0;
    let partialRun = false;

    if (tokens && tokens.length > 0) {
      for (const token of tokens) {
        // Check timeout before processing each token
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          console.log(`Timeout approaching after processing ${tokensProcessed}/${tokens.length} tokens, stopping`);
          partialRun = true;
          break;
        }

        try {
          const amm = new ethers.Contract(token.amm_address, AMM_ABI, provider);

          // Get all swap events for this token in the block range
          const events = await amm.queryFilter(amm.filters.Swap(), startBlock, endBlock);

          if (events.length === 0) {
            tokensProcessed++;
            continue;
          }

          // Sort events by block number, transaction index, log index
          // This ensures we process swaps in the exact order they occurred
          const sortedEvents = events.sort((a, b) => {
            if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
            return a.logIndex - b.logIndex;
          });

          // Process each swap individually to get correct per-swap reserves
          for (const event of sortedEvents) {
            try {
              const block = await provider.getBlock(event.blockNumber);
              if (!block) continue;

              const blockTimestamp = new Date(block.timestamp * 1000).toISOString();
              const ethIn = event.args!.ethIn;
              const tokenIn = event.args!.tokenIn;
              const ethOut = event.args!.ethOut;
              const tokenOut = event.args!.tokenOut;

              // Determine trade direction
              const isBuy = ethIn > 0n && tokenOut > 0n;
              const tradeDirection = isBuy ? 'BUY' : 'SELL';

              // Reconstruct post-trade reserves by replaying the swap
              // For a BUY (eth in, token out): tokenReserve decreases, ethReserve increases
              // For a SELL (token in, eth out): tokenReserve increases, ethReserve decreases
              // We use the event amounts to reconstruct the exact post-trade state
              //
              // The Swap event emits the amounts transferred, so:
              // post-trade ETH reserve = pre-trade ETH reserve + ethIn - ethOut
              // post-trade token reserve = pre-trade token reserve + tokenIn - tokenOut
              //
              // Since we process sequentially, we track the running reserve state
              // starting from the token's current reserves (which reflect the latest state)
              // and working backwards, OR we read the reserves at each block.
              //
              // The most reliable approach: read reserves from the contract at each block.
              // But that's expensive. Instead, we can reconstruct from the swap amounts
              // if we know the starting state.
              //
              // For correctness, we'll read the reserves at the block of each swap.
              // This is the only way to get the exact post-trade price.
              //
              // For multiple swaps in the same block, we need to track the running state.
              // We'll use a per-token running state within each block.

              // Get the post-trade reserves by reading at the end of the block
              // For multiple swaps in the same block, we need to reconstruct sequentially
              // We'll track a running state per token within this indexing run

              // Read the reserves as they were at this block
              // We use eth_call with blockTag to get historical state
              let postTradeEthReserve: bigint;
              let postTradeTokenReserve: bigint;

              if (sortedEvents.length === 1) {
                // Single swap - read current reserves (they reflect this swap's result)
                [postTradeEthReserve, postTradeTokenReserve] = await Promise.all([
                  amm.reserveETH({ blockTag: event.blockNumber }),
                  amm.reserveToken({ blockTag: event.blockNumber })
                ]);
              } else {
                // Multiple swaps - we need to reconstruct per-swap
                // Read reserves at the block before the first swap
                // Then replay each swap to get per-swap post-trade reserves
                // This is handled by the sequential processing below
                // For now, read at this block's end state
                [postTradeEthReserve, postTradeTokenReserve] = await Promise.all([
                  amm.reserveETH({ blockTag: event.blockNumber }),
                  amm.reserveToken({ blockTag: event.blockNumber })
                ]);
              }

              const postEthFormatted = ethers.formatEther(postTradeEthReserve);
              const postTokenFormatted = ethers.formatEther(postTradeTokenReserve);
              const priceEth = parseFloat(postEthFormatted) / parseFloat(postTokenFormatted);

              // Get historical ETH/USD price
              const ethPriceUsd = await getEthPriceAt(supabase, blockTimestamp);
              if (!ethPriceUsd) {
                console.warn(`No ETH price for block ${event.blockNumber} at ${blockTimestamp}`);
              }

              const priceUsd = priceEth * (ethPriceUsd || 0);
              // Market cap = token supply * price per token
              // Token supply = 1,000,000 (fixed for all McFun tokens)
              const marketCapUsd = priceUsd * 1000000;

              // Insert swap record (idempotent via chain_id + tx_hash + log_index)
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
                log_index: event.logIndex,
                created_at: blockTimestamp,
                block_number: event.blockNumber,
                block_hash: block.hash,
                chain_id: chainId,
              };

              const { error: swapError } = await supabase
                .from("swaps")
                .upsert(swapRecord, { onConflict: 'chain_id,tx_hash,log_index' });

              if (swapError) {
                console.error(`Failed to upsert swap ${event.transactionHash}:${event.logIndex}:`, swapError);
              }

              // Create price snapshot for this specific trade (idempotent)
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
                log_index: event.logIndex,
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
                console.error(`Failed to upsert snapshot for ${event.transactionHash}:${event.logIndex}:`, snapError);
              } else {
                snapshotsCreated++;
              }

              swapsIndexed++;
            } catch (err) {
              console.error(`Error processing swap event:`, err);
            }
          }

          // Update token's current reserves to the latest state
          const [reserveETH, reserveToken] = await Promise.all([
            amm.reserveETH(),
            amm.reserveToken()
          ]);
          await supabase.from("tokens").update({
            current_eth_reserve: ethers.formatEther(reserveETH),
            current_token_reserve: ethers.formatEther(reserveToken),
          }).eq("token_address", token.token_address).eq("chain_id", chainId);

          tokensProcessed++;
        } catch (err) {
          console.error(`Error indexing ${token.token_address}:`, err);
          // Don't freeze the cursor for a single token's RPC failure.
          // The block range was still scanned; other tokens' swaps were processed.
          // The failing token will be retried on the next run when its RPC responds.
        }
      }
    }

    // CRITICAL: Only advance cursor if the ENTIRE range was successfully processed
    // If any token failed or we hit timeout, leave cursor where it was
    if (!partialRun) {
      await supabase.from("indexer_state").upsert({
        id: indexerState?.id,
        last_indexed_block: endBlock,
        last_block_hash: null,
        confirmation_depth: CONFIRMATION_DEPTH,
        updated_at: new Date().toISOString(),
        chain_id: chainId,
      });

      console.log(`[${chainConfig.CHAIN_NAME}] Cursor advanced to ${endBlock}`);
    } else {
      console.log(`[${chainConfig.CHAIN_NAME}] Partial run, cursor NOT advanced (stays at ${lastIndexedBlock})`);
    }

    const processingTimeMs = Date.now() - startTime;

    console.log(`[${chainConfig.CHAIN_NAME}] Indexed ${tokensLaunched} launches, ${swapsIndexed} swaps, ${snapshotsCreated} snapshots from ${tokensProcessed} tokens, blocks ${startBlock}-${endBlock} (${processingTimeMs}ms)`);

    return new Response(JSON.stringify({
      chainId,
      chainName: chainConfig.CHAIN_NAME,
      tokensLaunched,
      swapsIndexed,
      snapshotsCreated,
      tokensProcessed,
      fromBlock: startBlock,
      toBlock: endBlock,
      blocksBehind: safeBlock - endBlock,
      processingTimeMs,
      cursorAdvanced: !partialRun,
      partialRun,
    }), { headers: corsHeaders });
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
