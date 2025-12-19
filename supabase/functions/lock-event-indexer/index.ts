import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LOCKER_ADDRESS = "0x0000000000000000000000000000000000000000";
const RPC_URL = Deno.env.get("RPC_URL") || "https://eth-sepolia.public.blastapi.io";

const LOCKER_ABI = [
  "event TokensLocked(uint256 indexed lockId, address indexed owner, address indexed tokenAddress, uint256 amount, uint256 unlockTime)",
  "event TokensUnlocked(uint256 indexed lockId, address indexed owner, address indexed tokenAddress, uint256 amount)",
];

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

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

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const lockerContract = new ethers.Contract(LOCKER_ADDRESS, LOCKER_ABI, provider);

    const { data: lastIndexedLock } = await supabase
      .from("token_locks")
      .select("block_number")
      .order("block_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const fromBlock = lastIndexedLock?.block_number
      ? Number(lastIndexedLock.block_number) + 1
      : 0;

    const currentBlock = await provider.getBlockNumber();
    const toBlock = currentBlock;

    console.log(`Indexing locks from block ${fromBlock} to ${toBlock}`);

    const lockedFilter = lockerContract.filters.TokensLocked();
    const lockedEvents = await lockerContract.queryFilter(lockedFilter, fromBlock, toBlock);

    console.log(`Found ${lockedEvents.length} TokensLocked events`);

    for (const event of lockedEvents) {
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

    const unlockedFilter = lockerContract.filters.TokensUnlocked();
    const unlockedEvents = await lockerContract.queryFilter(unlockedFilter, fromBlock, toBlock);

    console.log(`Found ${unlockedEvents.length} TokensUnlocked events`);

    for (const event of unlockedEvents) {
      try {
        const lockId = Number(event.args[0]);

        const { error: updateError } = await supabase
          .from("token_locks")
          .update({ is_withdrawn: true })
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
          locked: lockedEvents.length,
          unlocked: unlockedEvents.length,
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
