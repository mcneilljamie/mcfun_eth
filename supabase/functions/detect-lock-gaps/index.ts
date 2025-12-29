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
  "function lockCount() view returns (uint256)",
  "function locks(uint256) view returns (address owner, address tokenAddress, uint256 amount, uint256 unlockTime, bool withdrawn)",
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const provider = await createProviderWithFailover();
    const lockerContract = new ethers.Contract(LOCKER_ADDRESS, LOCKER_ABI, provider);

    console.log("Fetching total lock count from blockchain...");
    const lockCount = await lockerContract.lockCount();
    const totalOnChainLocks = Number(lockCount);
    console.log(`Total locks on-chain: ${totalOnChainLocks}`);

    console.log("Fetching lock IDs from database...");
    const { data: dbLocks } = await supabase
      .from("token_locks")
      .select("lock_id")
      .order("lock_id", { ascending: true });

    const dbLockIds = new Set((dbLocks || []).map(l => l.lock_id));
    console.log(`Total locks in database: ${dbLockIds.size}`);

    const missingLockIds: number[] = [];
    const gaps: Array<{ start: number; end: number; count: number }> = [];
    let gapStart: number | null = null;

    for (let lockId = 0; lockId < totalOnChainLocks; lockId++) {
      if (!dbLockIds.has(lockId)) {
        missingLockIds.push(lockId);
        
        if (gapStart === null) {
          gapStart = lockId;
        }
      } else {
        if (gapStart !== null) {
          gaps.push({
            start: gapStart,
            end: lockId - 1,
            count: lockId - gapStart
          });
          gapStart = null;
        }
      }
    }

    if (gapStart !== null) {
      gaps.push({
        start: gapStart,
        end: totalOnChainLocks - 1,
        count: totalOnChainLocks - gapStart
      });
    }

    let mcfunLocked = BigInt(0);
    let mcfunWithdrawn = BigInt(0);
    let otherTokensLocked = BigInt(0);
    let otherTokensWithdrawn = BigInt(0);

    const MCFUN_ADDRESS = "0xeb2a67cf363a0c1298d8c9c6bf9f211876f5743c";
    const BATCH_SIZE = 10;

    console.log(`Sampling ${Math.min(100, totalOnChainLocks)} locks to estimate actual locked amounts...`);
    for (let i = 0; i < Math.min(100, totalOnChainLocks); i += BATCH_SIZE) {
      const batch = [];
      for (let j = 0; j < BATCH_SIZE && (i + j) < Math.min(100, totalOnChainLocks); j++) {
        batch.push(lockerContract.locks(i + j));
      }
      
      const results = await Promise.all(batch);
      
      for (const lock of results) {
        const tokenAddress = lock.tokenAddress.toLowerCase();
        const amount = BigInt(lock.amount.toString());
        const withdrawn = lock.withdrawn;

        if (tokenAddress === MCFUN_ADDRESS) {
          if (withdrawn) {
            mcfunWithdrawn += amount;
          } else {
            mcfunLocked += amount;
          }
        } else {
          if (withdrawn) {
            otherTokensWithdrawn += amount;
          } else {
            otherTokensLocked += amount;
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const summary = {
      on_chain_total_locks: totalOnChainLocks,
      database_total_locks: dbLockIds.size,
      missing_locks: missingLockIds.length,
      missing_percentage: ((missingLockIds.length / totalOnChainLocks) * 100).toFixed(2) + "%",
      gaps_detected: gaps.length,
      gaps: gaps.slice(0, 10),
      sample_analysis: {
        sample_size: Math.min(100, totalOnChainLocks),
        mcfun_locked: (mcfunLocked / BigInt(10 ** 18)).toString() + " MCFUN",
        mcfun_withdrawn: (mcfunWithdrawn / BigInt(10 ** 18)).toString() + " MCFUN",
        other_tokens_locked_count: otherTokensLocked > 0 ? "Yes" : "No",
      },
      missing_lock_ids: missingLockIds.slice(0, 50),
      execution_time_ms: Date.now() - startTime,
    };

    console.log(`Gap detection complete: ${missingLockIds.length}/${totalOnChainLocks} locks missing from database`);

    return new Response(
      JSON.stringify(summary, null, 2),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: any) {
    console.error("Error in lock gap detection:", err);
    return new Response(
      JSON.stringify({
        error: err.message,
        stack: err.stack,
        execution_time_ms: Date.now() - startTime,
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