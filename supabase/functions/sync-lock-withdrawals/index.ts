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
  "function getLock(uint256 lockId) view returns (address owner, address tokenAddress, uint256 amount, uint256 unlockTime, bool withdrawn)",
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

    const rpcUrl = Deno.env.get("ETHEREUM_RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const lockerContract = new ethers.Contract(LOCKER_ADDRESS, LOCKER_ABI, provider);

    // Get all locks that show as not withdrawn
    const { data: locks, error: queryError } = await supabase
      .from("token_locks")
      .select("lock_id, is_withdrawn")
      .eq("is_withdrawn", false)
      .order("lock_id");

    if (queryError) throw queryError;

    console.log(`Checking ${locks?.length || 0} locks for withdrawal status`);

    const updates = [];
    const errors = [];

    for (const lock of locks || []) {
      try {
        // Check on-chain status with retry
        let lockInfo;
        let retries = 3;
        while (retries > 0) {
          try {
            lockInfo = await lockerContract.getLock(lock.lock_id);
            break;
          } catch (err: any) {
            retries--;
            if (retries === 0) throw err;
            console.log(`Retry ${3 - retries}/3 for lock ${lock.lock_id}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        const isWithdrawnOnChain = lockInfo[4];

        // If on-chain shows withdrawn but DB shows not withdrawn, update DB
        if (isWithdrawnOnChain && !lock.is_withdrawn) {
          const { error: updateError } = await supabase
            .from("token_locks")
            .update({
              is_withdrawn: true,
              withdraw_tx_hash: "synced_from_chain"
            })
            .eq("lock_id", lock.lock_id);

          if (updateError) {
            errors.push({ lock_id: lock.lock_id, error: updateError.message });
          } else {
            updates.push(lock.lock_id);
            console.log(`Updated lock ${lock.lock_id} as withdrawn`);
          }
        }

        // Rate limiting - 200ms between calls
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err: any) {
        console.error(`Error checking lock ${lock.lock_id}:`, err);
        errors.push({ lock_id: lock.lock_id, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: locks?.length || 0,
        updated: updates.length,
        updates,
        errors,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Sync error:", error);

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
