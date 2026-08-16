import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";
import { getLockerAddress, getRPCProviders, getSupportedChainIds } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const chainIds = getSupportedChainIds();
    let totalChecked = 0;
    let totalUpdated = 0;
    const allUpdates: number[] = [];
    const allErrors: any[] = [];

    for (const chainId of chainIds) {
      try {
        const rpcProviders = getRPCProviders(chainId);
        const lockerAddress = getLockerAddress(chainId);

        let provider: ethers.JsonRpcProvider | null = null;
        for (const rpcUrl of rpcProviders) {
          try {
            const p = new ethers.JsonRpcProvider(rpcUrl);
            await p.getBlockNumber();
            provider = p;
            break;
          } catch {
            continue;
          }
        }
        if (!provider) {
          throw new Error(`All RPC providers failed for chain ${chainId}`);
        }

        const lockerContract = new ethers.Contract(lockerAddress, LOCKER_ABI, provider);

        const { data: locks, error: queryError } = await supabase
          .from("token_locks")
          .select("lock_id, is_withdrawn")
          .eq("is_withdrawn", false)
          .eq("chain_id", chainId)
          .order("lock_id");

        if (queryError) throw queryError;

        console.log(`Chain ${chainId}: checking ${locks?.length || 0} non-withdrawn locks`);

        for (const lock of locks || []) {
          try {
            let lockInfo;
            let retries = 3;
            while (retries > 0) {
              try {
                lockInfo = await lockerContract.getLock(lock.lock_id);
                break;
              } catch (err: any) {
                retries--;
                if (retries === 0) throw err;
                console.log(`Chain ${chainId}: retry ${3 - retries}/3 for lock ${lock.lock_id}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }

            const isWithdrawnOnChain = lockInfo[4];

            if (isWithdrawnOnChain && !lock.is_withdrawn) {
              const { error: updateError } = await supabase
                .from("token_locks")
                .update({
                  is_withdrawn: true,
                  withdraw_tx_hash: "synced_from_chain"
                })
                .eq("lock_id", lock.lock_id)
                .eq("chain_id", chainId);

              if (updateError) {
                allErrors.push({ chain_id: chainId, lock_id: lock.lock_id, error: updateError.message });
              } else {
                allUpdates.push(lock.lock_id);
                console.log(`Chain ${chainId}: updated lock ${lock.lock_id} as withdrawn`);
              }
            }

            totalChecked++;
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (err: any) {
            console.error(`Chain ${chainId}: error checking lock ${lock.lock_id}:`, err);
            allErrors.push({ chain_id: chainId, lock_id: lock.lock_id, error: err.message });
          }
        }
      } catch (err: any) {
        console.error(`Chain ${chainId} sync error:`, err);
        allErrors.push({ chain_id: chainId, error: err.message });
      }
    }

    totalUpdated = allUpdates.length;

    return new Response(
      JSON.stringify({
        success: true,
        chains_checked: chainIds,
        checked: totalChecked,
        updated: totalUpdated,
        updates: allUpdates,
        errors: allErrors,
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
