import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";
import { withLock } from "./_shared/lockManager.ts";

const corsHeaders = {
  "Content-Type": "application/json",
};

const LOCKER_ADDRESS = "0x1277b6E3f4407AD44A9b33641b51848c0098368f";

const LOCKER_ABI = [
  "event TokensLocked(uint256 indexed lockId, address indexed owner, address indexed tokenAddress, uint256 amount, uint256 unlockTime)",
  "event TokensUnlocked(uint256 indexed lockId, address indexed owner, address indexed tokenAddress, uint256 amount)",
];

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const RPC_PROVIDERS = [
  Deno.env.get("ETHEREUM_RPC_URL") || Deno.env.get("RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
  "https://rpc2.sepolia.org",
];

let currentProviderIndex = 0;

const tokenMetadataCache = new Map<string, { name: string; symbol: string; decimals: number }>();

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
                               error?.code === 429;

      if (isRateLimitError && i < maxRetries - 1) {
        const delay = Math.min(initialDelay * Math.pow(3, i), 60000);
        console.log(`Rate limit detected, waiting ${delay}ms before retry ${i + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function rateLimit(delayMs: number = 200) {
  await new Promise(resolve => setTimeout(resolve, delayMs));
}


async function getTokenMetadata(
  tokenAddress: string,
  provider: ethers.JsonRpcProvider,
  supabase: any
): Promise<{ name: string; symbol: string; decimals: number }> {
  const normalizedAddress = tokenAddress.toLowerCase();

  const cached = tokenMetadataCache.get(normalizedAddress);
  if (cached) {
    return cached;
  }

  const { data: dbCache } = await supabase
    .from('token_metadata_cache')
    .select('name, symbol, decimals')
    .eq('token_address', normalizedAddress)
    .eq('is_valid', true)
    .maybeSingle();

  if (dbCache) {
    const metadata = {
      name: dbCache.name,
      symbol: dbCache.symbol,
      decimals: dbCache.decimals
    };
    tokenMetadataCache.set(normalizedAddress, metadata);
    return metadata;
  }

  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const [name, symbol, decimals] = await Promise.all([
    tokenContract.name(),
    tokenContract.symbol(),
    tokenContract.decimals(),
  ]);

  const metadata = { name, symbol, decimals: Number(decimals) };

  tokenMetadataCache.set(normalizedAddress, metadata);

  await supabase
    .from('token_metadata_cache')
    .upsert({
      token_address: normalizedAddress,
      name,
      symbol,
      decimals: Number(decimals),
      cached_at: new Date().toISOString(),
      is_valid: true
    });

  return metadata;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    return await withLock("lock_event_indexer_lock", async () => {
      return await processLockIndexing(req);
    }, {
      timeoutSeconds: 300,
      autoRenew: true,
      renewIntervalMs: 30000,
    });
  } catch (err: any) {
    console.error("Error acquiring lock or executing lock-event-indexer:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message,
        message: err.message.includes("Failed to acquire lock")
          ? "Lock event indexer is busy processing. This request will be retried automatically."
          : undefined
      }),
      {
        status: err.message.includes("Failed to acquire lock") ? 503 : 500,
        headers: corsHeaders,
      }
    );
  }
});

async function processLockIndexing(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {

    const provider = await retryWithBackoff(() => createProviderWithFailover());
    const lockerContract = new ethers.Contract(LOCKER_ADDRESS, LOCKER_ABI, provider);

    const { data: skipBlocksData } = await supabase
      .from("skip_blocks")
      .select("block_number")
      .in("indexer_type", ["lock", "all"]);

    const skipBlocks = new Set(
      skipBlocksData?.map(sb => sb.block_number) || []
    );

    let requestedStartBlock: number | null = null;
    let catchupMode = false;
    let forceReindex = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.fromBlock !== undefined) {
          requestedStartBlock = Number(body.fromBlock);
        }
        if (body.catchup === true) {
          catchupMode = true;
        }
        if (body.force === true) {
          forceReindex = true;
        }
      } catch {
      }
    }

    const { data: indexerState } = await supabase
      .from("lock_indexer_state")
      .select("*")
      .eq("indexer_name", "lock_indexer")
      .maybeSingle();

    const currentBlock = await provider.getBlockNumber();

    if (indexerState?.is_active) {
      const lastActiveTime = indexerState.last_indexed_at
        ? new Date(indexerState.last_indexed_at).getTime()
        : 0;
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

      if (lastActiveTime > fiveMinutesAgo) {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Indexer is already running',
            skipped: true
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      } else {
        console.log('Stale is_active flag detected, resetting...');
        await supabase
          .from("lock_indexer_state")
          .update({ is_active: false })
          .eq("indexer_name", "lock_indexer");
      }
    }

    await supabase
      .from("lock_indexer_state")
      .update({ is_active: true })
      .eq("indexer_name", "lock_indexer");

    let fromBlock: number;
    let toBlock: number;

    const LOCKER_DEPLOYMENT_BLOCK = 7413490;

    const lastIndexedBlock = indexerState?.last_indexed_block || LOCKER_DEPLOYMENT_BLOCK;
    const blocksBehind = currentBlock - lastIndexedBlock;

    let MAX_RANGE: number;
    if (catchupMode) {
      MAX_RANGE = 10000;
    } else if (blocksBehind > 5000) {
      MAX_RANGE = 10000;
      console.log(`Adaptive mode: ${blocksBehind} blocks behind, processing 10000 blocks per run`);
    } else if (blocksBehind > 1000) {
      MAX_RANGE = 5000;
      console.log(`Adaptive mode: ${blocksBehind} blocks behind, processing 5000 blocks per run`);
    } else if (blocksBehind > 500) {
      MAX_RANGE = 2000;
      console.log(`Adaptive mode: ${blocksBehind} blocks behind, processing 2000 blocks per run`);
    } else {
      MAX_RANGE = 1000;
      console.log(`Adaptive mode: ${blocksBehind} blocks behind, processing 1000 blocks per run`);
    }

    if (catchupMode) {
      fromBlock = LOCKER_DEPLOYMENT_BLOCK;
      toBlock = currentBlock;
      console.log('Running in CATCHUP mode - scanning entire history');
    } else if (requestedStartBlock !== null) {
      fromBlock = requestedStartBlock;
      toBlock = currentBlock;
      if (toBlock - fromBlock > MAX_RANGE) {
        toBlock = fromBlock + MAX_RANGE;
        console.log(`Limiting scan range to ${MAX_RANGE} blocks to avoid timeout`);
      }
    } else {
      fromBlock = indexerState?.last_indexed_block
        ? Math.max(LOCKER_DEPLOYMENT_BLOCK, indexerState.last_indexed_block + 1)
        : LOCKER_DEPLOYMENT_BLOCK;

      toBlock = currentBlock;

      if (fromBlock >= currentBlock) {
        await supabase
          .from("lock_indexer_state")
          .update({ is_active: false })
          .eq("indexer_name", "lock_indexer");

        return new Response(
          JSON.stringify({
            success: true,
            message: 'No new blocks to index',
            skipped: true,
            currentBlock,
            lastIndexedBlock: indexerState?.last_indexed_block
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      if (toBlock - fromBlock > MAX_RANGE) {
        toBlock = fromBlock + MAX_RANGE;
        console.log(`Limiting scan range to ${MAX_RANGE} blocks to reduce RPC calls`);
      }
    }

    if (fromBlock > toBlock) {
      return new Response(
        JSON.stringify({
          success: true,
          indexed: { locked: 0, unlocked: 0 },
          message: 'No new blocks to index',
          fromBlock,
          toBlock,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(`Indexing locks from block ${fromBlock} to ${toBlock}`);

    const CHUNK_SIZE = 10000;
    const allLockedEvents = [];
    const allUnlockedEvents = [];

    for (let chunkStart = fromBlock; chunkStart <= toBlock; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, toBlock);
      console.log(`Querying chunk: ${chunkStart} to ${chunkEnd}`);

      const lockedFilter = lockerContract.filters.TokensLocked();
      const lockedEvents = await lockerContract.queryFilter(lockedFilter, chunkStart, chunkEnd);
      allLockedEvents.push(...lockedEvents);

      const unlockedFilter = lockerContract.filters.TokensUnlocked();
      const unlockedEvents = await lockerContract.queryFilter(unlockedFilter, chunkStart, chunkEnd);
      allUnlockedEvents.push(...unlockedEvents);
    }

    console.log(`Found ${allLockedEvents.length} TokensLocked events`);
    console.log(`Force reindex mode: ${forceReindex}`);

    const newLocks = [];
    const PARALLEL_BATCH_SIZE = 10;
    let processedCount = 0;
    let skippedCount = 0;

    const uniqueTokens = new Set<string>();
    for (const event of allLockedEvents) {
      if (!skipBlocks.has(event.blockNumber)) {
        const tokenAddress = event.args[2].toLowerCase();
        uniqueTokens.add(tokenAddress);
      }
    }

    const tokensToFetch = Array.from(uniqueTokens).filter(
      addr => !tokenMetadataCache.has(addr)
    );

    console.log(`Pre-fetching metadata for ${tokensToFetch.length} unique tokens in parallel`);

    for (let i = 0; i < tokensToFetch.length; i += PARALLEL_BATCH_SIZE) {
      const batch = tokensToFetch.slice(i, i + PARALLEL_BATCH_SIZE);
      await Promise.all(
        batch.map(tokenAddr =>
          retryWithBackoff(() => getTokenMetadata(tokenAddr, provider, supabase))
            .catch(err => {
              console.error(`Failed to fetch metadata for ${tokenAddr}:`, err);
              return null;
            })
        )
      );
      await rateLimit(200);
    }

    console.log(`Processing ${allLockedEvents.length} lock events with cached metadata`);

    for (let i = 0; i < allLockedEvents.length; i += PARALLEL_BATCH_SIZE) {
      const batch = allLockedEvents.slice(i, i + PARALLEL_BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (event) => {
          try {
            if (skipBlocks.has(event.blockNumber)) {
              return { skipped: true };
            }

            const lockId = Number(event.args[0]);
            const owner = event.args[1];
            const tokenAddress = event.args[2];
            const amount = event.args[3];
            const unlockTime = Number(event.args[4]);

            const metadata = tokenMetadataCache.get(tokenAddress.toLowerCase());
            if (!metadata) {
              const fetched = await retryWithBackoff(
                () => getTokenMetadata(tokenAddress, provider, supabase)
              );
              return { lock: null, metadata: fetched, event, owner, tokenAddress, amount, unlockTime, lockId };
            }

            const block = await retryWithBackoff(() => provider.getBlock(event.blockNumber));
            const lockTimestamp = block ? block.timestamp : Math.floor(Date.now() / 1000);
            const durationDays = Math.floor((unlockTime - lockTimestamp) / 86400);

            return {
              lock: {
                lock_id: lockId,
                user_address: owner.toLowerCase(),
                token_address: tokenAddress.toLowerCase(),
                token_symbol: metadata.symbol,
                token_name: metadata.name,
                token_decimals: metadata.decimals,
                amount_locked: amount.toString(),
                lock_duration_days: durationDays,
                lock_timestamp: new Date(lockTimestamp * 1000).toISOString(),
                unlock_timestamp: new Date(unlockTime * 1000).toISOString(),
                is_withdrawn: false,
                tx_hash: event.transactionHash,
                block_number: event.blockNumber,
              }
            };
          } catch (err: any) {
            console.error(`Error processing lock event ${Number(event.args[0])}:`, err);
            return { error: err.message };
          }
        })
      );

      for (const result of batchResults) {
        if (result.skipped) {
          skippedCount++;
        } else if (result.lock) {
          newLocks.push(result.lock);
          processedCount++;
        } else if (result.error) {
          if (result.error.includes('429') || result.error.includes('rate limit')) {
            console.log('Rate limit hit, waiting 5 seconds before continuing...');
            await rateLimit(5000);
          }
        }
      }
    }

    if (newLocks.length > 0) {
      const { error: upsertError } = await supabase
        .from("token_locks")
        .upsert(newLocks, {
          onConflict: 'lock_id',
          ignoreDuplicates: false
        });

      if (upsertError) {
        console.error('Failed to upsert locks:', upsertError);
      } else {
        console.log(`Upserted ${newLocks.length} locks (${processedCount} processed, ${skippedCount} skipped)`);
      }
    }

    console.log(`Found ${allUnlockedEvents.length} TokensUnlocked events`);

    for (const event of allUnlockedEvents) {
      try {
        if (skipBlocks.has(event.blockNumber)) {
          console.log(`Skipping unlock event in block ${event.blockNumber} (marked as erroneous)`);
          continue;
        }

        const lockId = Number(event.args[0]);

        const { error: updateError } = await supabase
          .from("token_locks")
          .update({
            is_withdrawn: true,
            withdraw_tx_hash: event.transactionHash
          })
          .eq("lock_id", lockId);

        if (updateError) {
          console.error(`Failed to update lock ${lockId}:`, updateError);
        } else {
          console.log(`Updated lock ${lockId} as withdrawn`);
        }
      } catch (err) {
        console.error("Error processing unlock event:", err);
      }
    }

    const newBlocksBehind = currentBlock - toBlock;
    const blocksProcessed = toBlock - fromBlock + 1;
    const processingTimeSeconds = (Date.now() - new Date(indexerState?.last_indexed_at || Date.now()).getTime()) / 1000;
    const blocksPerSecond = processingTimeSeconds > 0 ? (blocksProcessed / processingTimeSeconds).toFixed(2) : 0;

    await supabase
      .from("lock_indexer_state")
      .update({
        last_indexed_block: toBlock,
        last_indexed_at: new Date().toISOString(),
        is_active: false,
        metadata: {
          last_run: new Date().toISOString(),
          blocks_scanned: blocksProcessed,
          locks_indexed: newLocks.length,
          unlocks_indexed: allUnlockedEvents.length,
          blocks_behind: newBlocksBehind,
          blocks_per_second: blocksPerSecond,
          processing_time_seconds: processingTimeSeconds.toFixed(2),
          max_range_used: MAX_RANGE,
          current_block: currentBlock
        }
      })
      .eq("indexer_name", "lock_indexer");

    console.log(`Updated indexer state: last_indexed_block = ${toBlock}, blocks_behind = ${newBlocksBehind}, blocks/sec = ${blocksPerSecond}`);

    return new Response(
      JSON.stringify({
        success: true,
        indexed: {
          locked: processedCount,
          unlocked: allUnlockedEvents.length,
          skipped: skippedCount,
        },
        fromBlock,
        toBlock,
        mode: forceReindex ? 'force-reindex' : (catchupMode ? 'catchup' : 'adaptive'),
        blocksScanned: blocksProcessed,
        blocksBehind: newBlocksBehind,
        blocksPerSecond: blocksPerSecond,
        maxRangeUsed: MAX_RANGE,
        currentBlock,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Lock indexer error:", error);

    await supabase
      .from("lock_indexer_state")
      .update({
        is_active: false,
        metadata: {
          last_error: error.message,
          last_error_at: new Date().toISOString()
        }
      })
      .eq("indexer_name", "lock_indexer");

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
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
