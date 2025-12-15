import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FACTORY_ADDRESS = "0xDE377c1C3280C2De18479Acbe40a06a79E0B3831";

const FACTORY_ABI = [
  "event TokenLaunched(address indexed tokenAddress, address indexed ammAddress, string name, string symbol, address indexed creator, uint256 liquidityPercent, uint256 initialLiquidityETH)"
];

const AMM_ABI = [
  "event Swap(address indexed user, uint256 ethIn, uint256 tokenIn, uint256 ethOut, uint256 tokenOut)",
  "function reserveToken() external view returns (uint256)",
  "function reserveETH() external view returns (uint256)"
];

interface IndexRequest {
  fromBlock?: number;
  toBlock?: number;
  indexTokenLaunches?: boolean;
  indexSwaps?: boolean;
  skipReorgCheck?: boolean;
}

async function detectAndHandleReorg(
  supabase: any,
  provider: ethers.JsonRpcProvider,
  lastIndexedBlock: number,
  lastBlockHash: string | null
): Promise<{ reorgDetected: boolean; rollbackToBlock: number; error?: string }> {
  if (!lastBlockHash || lastIndexedBlock === 0) {
    return { reorgDetected: false, rollbackToBlock: lastIndexedBlock };
  }

  try {
    const currentBlock = await provider.getBlock(lastIndexedBlock);

    if (!currentBlock) {
      console.warn(`Block ${lastIndexedBlock} not found, chain may have reorged`);
      return { reorgDetected: true, rollbackToBlock: Math.max(0, lastIndexedBlock - 100) };
    }

    if (currentBlock.hash !== lastBlockHash) {
      console.warn(`Reorg detected! Block ${lastIndexedBlock} hash mismatch`);
      console.warn(`Stored: ${lastBlockHash}, Current: ${currentBlock.hash}`);

      let rollbackBlock = lastIndexedBlock - 1;
      while (rollbackBlock > Math.max(0, lastIndexedBlock - 100)) {
        const { data: blockData } = await supabase
          .from("tokens")
          .select("block_hash")
          .eq("block_number", rollbackBlock)
          .limit(1)
          .maybeSingle();

        if (blockData?.block_hash) {
          const chainBlock = await provider.getBlock(rollbackBlock);
          if (chainBlock && chainBlock.hash === blockData.block_hash) {
            return { reorgDetected: true, rollbackToBlock: rollbackBlock };
          }
        }
        rollbackBlock--;
      }

      return { reorgDetected: true, rollbackToBlock: Math.max(0, lastIndexedBlock - 100) };
    }

    return { reorgDetected: false, rollbackToBlock: lastIndexedBlock };
  } catch (err: any) {
    console.error("Error detecting reorg:", err);
    return { reorgDetected: false, rollbackToBlock: lastIndexedBlock, error: err.message };
  }
}

async function rollbackToBlock(supabase: any, blockNumber: number): Promise<{ deletedTokens: number; deletedSwaps: number; deletedSnapshots: number }> {
  console.log(`Rolling back data from blocks > ${blockNumber}`);

  const { count: deletedTokens } = await supabase
    .from("tokens")
    .delete({ count: "exact" })
    .gt("block_number", blockNumber);

  const { count: deletedSwaps } = await supabase
    .from("swaps")
    .delete({ count: "exact" })
    .gt("block_number", blockNumber);

  const { count: deletedSnapshots } = await supabase
    .from("price_snapshots")
    .delete({ count: "exact" })
    .gt("block_number", blockNumber);

  return {
    deletedTokens: deletedTokens || 0,
    deletedSwaps: deletedSwaps || 0,
    deletedSnapshots: deletedSnapshots || 0,
  };
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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const rpcUrl = Deno.env.get("ETHEREUM_RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com";

    const supabase = createClient(supabaseUrl, supabaseKey);
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const {
      fromBlock,
      toBlock,
      indexTokenLaunches = true,
      indexSwaps = true,
      skipReorgCheck = false
    }: IndexRequest = await req.json().catch(() => ({}));

    const { data: indexerState } = await supabase
      .from("indexer_state")
      .select("*")
      .limit(1)
      .maybeSingle();

    const lastIndexedBlock = indexerState?.last_indexed_block || 0;
    const lastBlockHash = indexerState?.last_block_hash || null;
    const confirmationDepth = indexerState?.confirmation_depth || 2;

    const results = {
      tokensIndexed: 0,
      swapsIndexed: 0,
      errors: [] as string[],
      reorgDetected: false,
      rollbackData: null as any,
      fromBlock: 0,
      toBlock: 0,
    };

    if (!skipReorgCheck && lastIndexedBlock > 0) {
      const reorgResult = await detectAndHandleReorg(supabase, provider, lastIndexedBlock, lastBlockHash);

      if (reorgResult.error) {
        results.errors.push(`Reorg detection error: ${reorgResult.error}`);
      }

      if (reorgResult.reorgDetected) {
        results.reorgDetected = true;
        const rollbackData = await rollbackToBlock(supabase, reorgResult.rollbackToBlock);
        results.rollbackData = rollbackData;

        await supabase
          .from("indexer_state")
          .update({
            last_indexed_block: reorgResult.rollbackToBlock,
            last_block_hash: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", indexerState.id);

        console.log(`Rolled back to block ${reorgResult.rollbackToBlock}`, rollbackData);
      }
    }

    const currentBlock = await provider.getBlockNumber();
    const safeBlock = currentBlock - confirmationDepth;

    let startBlock = fromBlock !== undefined ? fromBlock : Math.max(lastIndexedBlock + 1, 0);

    if (startBlock === 0 || startBlock < (safeBlock - 100000)) {
      startBlock = Math.max(safeBlock - 10000, 0);
    }

    let endBlock = toBlock !== undefined ? toBlock : safeBlock;

    const MAX_BLOCK_RANGE = 10000;
    if (endBlock - startBlock > MAX_BLOCK_RANGE) {
      endBlock = startBlock + MAX_BLOCK_RANGE;
    }

    if (startBlock > endBlock) {
      return new Response(
        JSON.stringify({
          ...results,
          message: "No new blocks to index",
          lastIndexedBlock,
          currentBlock,
          safeBlock,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    results.fromBlock = startBlock;
    results.toBlock = endBlock;

    let lastProcessedBlockNumber = startBlock;
    let lastProcessedBlockHash: string | null = null;

    if (indexTokenLaunches && FACTORY_ADDRESS !== "0x0000000000000000000000000000000000000000") {
      try {
        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        const filter = factory.filters.TokenLaunched();
        const events = await factory.queryFilter(filter, startBlock, endBlock);

        for (const event of events) {
          const args = event.args!;
          const block = await event.getBlock();

          const initialLiquidityEth = parseFloat(ethers.formatEther(args.initialLiquidityETH));
          const liquidityPercent = Number(args.liquidityPercent);
          const initialTokenReserve = 1000000 * liquidityPercent / 100;
          const launchPriceEth = initialLiquidityEth / initialTokenReserve;

          const { error } = await supabase
            .from("tokens")
            .upsert({
              token_address: args.tokenAddress.toLowerCase(),
              amm_address: args.ammAddress.toLowerCase(),
              name: args.name,
              symbol: args.symbol,
              creator_address: args.creator.toLowerCase(),
              liquidity_percent: liquidityPercent,
              initial_liquidity_eth: initialLiquidityEth.toString(),
              launch_price_eth: launchPriceEth.toString(),
              current_eth_reserve: initialLiquidityEth.toString(),
              current_token_reserve: initialTokenReserve.toString(),
              total_volume_eth: "0",
              created_at: new Date(block.timestamp * 1000).toISOString(),
              block_number: block.number,
              block_hash: block.hash,
            }, {
              onConflict: "token_address",
            });

          if (error) {
            results.errors.push(`Failed to insert token ${args.tokenAddress}: ${error.message}`);
          } else {
            results.tokensIndexed++;
            lastProcessedBlockNumber = Math.max(lastProcessedBlockNumber, block.number);
            lastProcessedBlockHash = block.hash;

            try {
              const historyResponse = await fetch(`${supabaseUrl}/functions/v1/generate-initial-history`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  tokenAddress: args.tokenAddress.toLowerCase(),
                  initialPriceETH: launchPriceEth,
                  initialEthReserve: initialLiquidityEth,
                  initialTokenReserve: initialTokenReserve,
                  createdAt: new Date(block.timestamp * 1000).toISOString(),
                  hoursOfHistory: 24,
                }),
              });

              if (!historyResponse.ok) {
                const errorText = await historyResponse.text();
                console.error(`Failed to generate initial history for ${args.tokenAddress}: ${errorText}`);
              } else {
                const historyResult = await historyResponse.json();
                console.log(`Generated ${historyResult.snapshotsCreated} initial snapshots for ${args.tokenAddress}`);
              }
            } catch (historyErr: any) {
              console.error(`Error generating initial history for ${args.tokenAddress}:`, historyErr);
            }
          }
        }
      } catch (err: any) {
        results.errors.push(`Token launch indexing error: ${err.message}`);
      }
    }

    if (indexSwaps) {
      try {
        const { data: tokens } = await supabase
          .from("tokens")
          .select("token_address, amm_address");

        if (tokens && tokens.length > 0) {
          for (const token of tokens) {
            try {
              const amm = new ethers.Contract(token.amm_address, AMM_ABI, provider);
              const filter = amm.filters.Swap();
              const events = await amm.queryFilter(filter, startBlock, endBlock);

              for (const event of events) {
                const args = event.args!;
                const block = await event.getBlock();

                const { error: swapError } = await supabase
                  .from("swaps")
                  .upsert({
                    token_address: token.token_address,
                    amm_address: token.amm_address,
                    user_address: args.user.toLowerCase(),
                    eth_in: ethers.formatEther(args.ethIn),
                    token_in: ethers.formatEther(args.tokenIn),
                    eth_out: ethers.formatEther(args.ethOut),
                    token_out: ethers.formatEther(args.tokenOut),
                    tx_hash: event.transactionHash,
                    created_at: new Date(block.timestamp * 1000).toISOString(),
                    block_number: block.number,
                    block_hash: block.hash,
                  }, {
                    onConflict: "tx_hash",
                  });

                if (swapError) {
                  results.errors.push(`Failed to insert swap: ${swapError.message}`);
                } else {
                  results.swapsIndexed++;
                  lastProcessedBlockNumber = Math.max(lastProcessedBlockNumber, block.number);
                  lastProcessedBlockHash = block.hash;

                  const [reserveETH, reserveToken] = await Promise.all([
                    amm.reserveETH(),
                    amm.reserveToken(),
                  ]);

                  const ethVolume = parseFloat(ethers.formatEther(args.ethIn)) +
                                    parseFloat(ethers.formatEther(args.ethOut));

                  const { data: currentToken } = await supabase
                    .from("tokens")
                    .select("total_volume_eth")
                    .eq("token_address", token.token_address)
                    .maybeSingle();

                  const currentVolume = parseFloat(currentToken?.total_volume_eth || "0");
                  const newVolume = (currentVolume + ethVolume).toString();

                  await supabase
                    .from("tokens")
                    .update({
                      current_eth_reserve: ethers.formatEther(reserveETH),
                      current_token_reserve: ethers.formatEther(reserveToken),
                      total_volume_eth: newVolume,
                    })
                    .eq("token_address", token.token_address);

                  if (parseFloat(ethers.formatEther(args.tokenOut)) > 0) {
                    await supabase.rpc('refresh_token_holder_count', {
                      p_token_address: token.token_address
                    });
                  }
                }
              }
            } catch (err: any) {
              results.errors.push(`Failed to index swaps for ${token.token_address}: ${err.message}`);
            }
          }
        }
      } catch (err: any) {
        results.errors.push(`Swap indexing error: ${err.message}`);
      }
    }

    if (results.swapsIndexed > 0 || results.tokensIndexed > 0) {
      try {
        await supabase.rpc('update_platform_stats');
      } catch (err: any) {
        results.errors.push(`Failed to update platform stats: ${err.message}`);
      }
    }

    if (lastProcessedBlockNumber >= startBlock) {
      if (!lastProcessedBlockHash) {
        const block = await provider.getBlock(lastProcessedBlockNumber);
        lastProcessedBlockHash = block?.hash || null;
      }

      await supabase
        .from("indexer_state")
        .upsert({
          id: indexerState?.id || undefined,
          last_indexed_block: lastProcessedBlockNumber,
          last_block_hash: lastProcessedBlockHash,
          confirmation_depth: confirmationDepth,
          updated_at: new Date().toISOString(),
        });
    }

    return new Response(
      JSON.stringify(results),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: any) {
    console.error("Error in event-indexer:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
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
