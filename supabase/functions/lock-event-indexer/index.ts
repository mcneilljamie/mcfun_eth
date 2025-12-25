import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";
import { withLock } from "../_shared/lockManager.ts";

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

// Token metadata cache to avoid repeated RPC calls
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
  initialDelay = 100
): Promise<T> {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}


// Get cached token metadata or fetch from blockchain
async function getTokenMetadata(
  tokenAddress: string,
  provider: ethers.JsonRpcProvider
): Promise<{ name: string; symbol: string; decimals: number }> {
  const cached = tokenMetadataCache.get(tokenAddress.toLowerCase());
  if (cached) {
    return cached;
  }

  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const [name, symbol, decimals] = await Promise.all([
    tokenContract.name(),
    tokenContract.symbol(),
    tokenContract.decimals(),
  ]);

  const metadata = { name, symbol, decimals: Number(decimals) };
  tokenMetadataCache.set(tokenAddress.toLowerCase(), metadata);
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

    // Check for custom start block from request body
    let requestedStartBlock: number | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.fromBlock !== undefined) {
          requestedStartBlock = Number(body.fromBlock);
        }
      } catch {
        // Ignore parsing errors
      }
    }

    const { data: lastIndexedLock } = await supabase
      .from("token_locks")
      .select("block_number")
      .order("block_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentBlock = await provider.getBlockNumber();

    // Smart block range: only scan recent blocks if we've indexed before
    const fromBlock = requestedStartBlock !== null
      ? requestedStartBlock
      : (lastIndexedLock?.block_number
        ? Math.max(0, Number(lastIndexedLock.block_number) - 2) // Only scan last 2 blocks for reorg protection
        : 0);

    const toBlock = currentBlock;

    // Skip if no new blocks
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

    // Query in chunks to avoid RPC limits (reduce chunk size for better reliability)
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

    // Batch check for existing locks
    const lockIds = allLockedEvents.map(e => Number(e.args[0]));
    const { data: existingLocks } = await supabase
      .from('token_locks')
      .select('lock_id')
      .in('lock_id', lockIds);

    const existingLockIds = new Set(existingLocks?.map(l => l.lock_id) || []);

    // Process new locks in batches
    const newLocks = [];
    for (const event of allLockedEvents) {
      try {
        const lockId = Number(event.args[0]);

        if (existingLockIds.has(lockId)) {
          console.log(`Lock ${lockId} already indexed, skipping`);
          continue;
        }

        const owner = event.args[1];
        const tokenAddress = event.args[2];
        const amount = event.args[3];
        const unlockTime = Number(event.args[4]);

        // Get token metadata (cached)
        const { name, symbol, decimals } = await getTokenMetadata(tokenAddress, provider);

        const block = await provider.getBlock(event.blockNumber);
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
      } catch (err) {
        console.error("Error processing lock event:", err);
      }
    }

    // Batch insert new locks
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

    // Process unlock events
    for (const event of allUnlockedEvents) {
      try {
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

    return new Response(
      JSON.stringify({
        success: true,
        indexed: {
          locked: newLocks.length,
          unlocked: allUnlockedEvents.length,
        },
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
  } catch (error: any) {
    console.error("Lock indexer error:", error);

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
