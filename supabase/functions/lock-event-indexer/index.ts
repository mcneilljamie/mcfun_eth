import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";
import { withLock } from "./_shared/lockManager.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
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
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.fromBlock !== undefined) {
          requestedStartBlock = Number(body.fromBlock);
        }
        if (body.catchup === true) {
          catchupMode = true;
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
    }

    await supabase
      .from("lock_indexer_state")
      .update({ is_active: true })
      .eq("indexer_name", "lock_indexer");

    let fromBlock: number;
    let toBlock: number;

    const LOCKER_DEPLOYMENT_BLOCK = 7413490;
    const MAX_RANGE = catchupMode ? 5000 : 100;

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

    const lockIds = allLockedEvents.map(e => Number(e.args[0]));
    const { data: existingLocks } = await supabase
      .from('token_locks')
      .select('lock_id')
      .in('lock_id', lockIds);

    const existingLockIds = new Set(existingLocks?.map(l => l.lock_id) || []);

    const newLocks = [];
    const PROCESS_BATCH_SIZE = 5;

    for (let i = 0; i < allLockedEvents.length; i++) {
      const event = allLockedEvents[i];
      try {
        if (skipBlocks.has(event.blockNumber)) {
          console.log(`Skipping lock event in block ${event.blockNumber} (marked as erroneous)`);
          continue;
        }

        const lockId = Number(event.args[0]);

        if (existingLockIds.has(lockId)) {
          console.log(`Lock ${lockId} already indexed, skipping`);
          continue;
        }

        const owner = event.args[1];
        const tokenAddress = event.args[2];
        const amount = event.args[3];
        const unlockTime = Number(event.args[4]);

        const { name, symbol, decimals } = await retryWithBackoff(
          () => getTokenMetadata(tokenAddress, provider, supabase)
        );

        await rateLimit(300);

        const block = await retryWithBackoff(() => provider.getBlock(event.blockNumber));
        const lockTimestamp = block ? block.timestamp : Math.floor(Date.now() / 1000);
        const durationDays = Math.floor((unlockTime - lockTimestamp) / 86400);

        newLocks.push({
          lock_id: lockId,
          user_address: owner.toLowerCase(),
          token_address: tokenAddress.toLowerCase(),
          token_symbol: symbol,
          token_name: name,
          token_decimals: decimals,
          amount_locked: amount.toString(),
          lock_duration_days: durationDays,
          lock_timestamp: new Date(lockTimestamp * 1000).toISOString(),
          unlock_timestamp: new Date(unlockTime * 1000).toISOString(),
          is_withdrawn: false,
          tx_hash: event.transactionHash,
          block_number: event.blockNumber,
        });

        if ((i + 1) % PROCESS_BATCH_SIZE === 0) {
          console.log(`Processed ${i + 1}/${allLockedEvents.length} locks, pausing to avoid rate limits...`);
          await rateLimit(2000);
        }
      } catch (err: any) {
        console.error(`Error processing lock event ${Number(event.args[0])}:`, err);

        if (err?.message?.includes('429') || err?.message?.includes('rate limit')) {
          console.log('Rate limit hit, waiting 10 seconds before continuing...');
          await rateLimit(10000);
        }
      }
    }

    if (newLocks.length > 0) {
      const { error: insertError } = await supabase
        .from("token_locks")
        .insert(newLocks);

      if (insertError) {
        console.error('Failed to batch insert locks:', insertError);
      } else {
        console.log(`Batch inserted ${newLocks.length} new locks`);
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

    await supabase
      .from("lock_indexer_state")
      .update({
        last_indexed_block: toBlock,
        last_indexed_at: new Date().toISOString(),
        is_active: false,
        metadata: {
          last_run: new Date().toISOString(),
          blocks_scanned: toBlock - fromBlock + 1,
          locks_indexed: newLocks.length,
          unlocks_indexed: allUnlockedEvents.length
        }
      })
      .eq("indexer_name", "lock_indexer");

    console.log(`Updated indexer state: last_indexed_block = ${toBlock}`);

    return new Response(
      JSON.stringify({
        success: true,
        indexed: {
          locked: newLocks.length,
          unlocked: allUnlockedEvents.length,
        },
        fromBlock,
        toBlock,
        mode: catchupMode ? 'catchup' : 'normal',
        blocksScanned: toBlock - fromBlock + 1,
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
