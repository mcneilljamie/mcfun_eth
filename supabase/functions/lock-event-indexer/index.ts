import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // If custom start block provided, use it
    // Otherwise, if first run, start from block 0 to catch ALL historical locks
    // Subsequent runs will start from last indexed block (not +1, to catch any missed events in that block)
    const fromBlock = requestedStartBlock !== null
      ? requestedStartBlock
      : (lastIndexedLock?.block_number
        ? Math.max(0, Number(lastIndexedLock.block_number) - 10) // Scan last 10 blocks to catch any missed events
        : 0);

    const toBlock = currentBlock;

    console.log(`Indexing locks from block ${fromBlock} to ${toBlock}`);

    // Query in chunks to avoid RPC limits (50k blocks per chunk)
    const CHUNK_SIZE = 50000;
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

    for (const event of allLockedEvents) {
      try {
        const lockId = Number(event.args[0]);
        const owner = event.args[1];
        const tokenAddress = event.args[2];
        const amount = event.args[3];
        const unlockTime = Number(event.args[4]);

        const { data: existingLock } = await supabase
          .from("token_locks")
          .select("id")
          .eq("lock_id", lockId)
          .maybeSingle();

        if (existingLock) {
          console.log(`Lock ${lockId} already indexed, skipping`);
          continue;
        }

        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const [name, symbol, decimals] = await Promise.all([
          tokenContract.name(),
          tokenContract.symbol(),
          tokenContract.decimals(),
        ]);

        const block = await provider.getBlock(event.blockNumber);
        const lockTimestamp = block ? block.timestamp : Math.floor(Date.now() / 1000);
        const durationDays = Math.floor((unlockTime - lockTimestamp) / 86400);

        const { error: insertError } = await supabase.from("token_locks").insert({
          lock_id: lockId,
          user_address: owner.toLowerCase(),
          token_address: tokenAddress.toLowerCase(),
          token_symbol: symbol,
          token_name: name,
          token_decimals: Number(decimals),
          amount_locked: amount.toString(),
          lock_duration_days: durationDays,
          lock_timestamp: new Date(lockTimestamp * 1000).toISOString(),
          unlock_timestamp: new Date(unlockTime * 1000).toISOString(),
          is_withdrawn: false,
          tx_hash: event.transactionHash,
          block_number: event.blockNumber,
        });

        if (insertError) {
          console.error(`Failed to insert lock ${lockId}:`, insertError);
        } else {
          console.log(`Indexed lock ${lockId}`);
        }
      } catch (err) {
        console.error("Error processing lock event:", err);
      }
    }

    console.log(`Found ${allUnlockedEvents.length} TokensUnlocked events`);

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
          console.log(`Updated lock ${lockId} as withdrawn with tx ${event.transactionHash}`);
        }
      } catch (err) {
        console.error("Error processing unlock event:", err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        indexed: {
          locked: allLockedEvents.length,
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
});
