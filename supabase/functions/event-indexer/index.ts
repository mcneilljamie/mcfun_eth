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

    const { fromBlock, toBlock, indexTokenLaunches = true, indexSwaps = true }: IndexRequest = 
      await req.json().catch(() => ({}));

    const currentBlock = await provider.getBlockNumber();
    const startBlock = fromBlock || Math.max(0, currentBlock - 1000);
    const endBlock = toBlock || currentBlock;

    const results = {
      tokensIndexed: 0,
      swapsIndexed: 0,
      errors: [] as string[],
      fromBlock: startBlock,
      toBlock: endBlock,
    };

    // Index token launches
    if (indexTokenLaunches && FACTORY_ADDRESS !== "0x0000000000000000000000000000000000000000") {
      try {
        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        const filter = factory.filters.TokenLaunched();
        const events = await factory.queryFilter(filter, startBlock, endBlock);

        for (const event of events) {
          const args = event.args!;
          const block = await event.getBlock();

          const { error } = await supabase
            .from("tokens")
            .upsert({
              token_address: args.tokenAddress.toLowerCase(),
              amm_address: args.ammAddress.toLowerCase(),
              name: args.name,
              symbol: args.symbol,
              creator_address: args.creator.toLowerCase(),
              liquidity_percent: Number(args.liquidityPercent),
              initial_liquidity_eth: ethers.formatEther(args.initialLiquidityETH),
              current_eth_reserve: ethers.formatEther(args.initialLiquidityETH),
              current_token_reserve: "1000000",
              total_volume_eth: "0",
              created_at: new Date(block.timestamp * 1000).toISOString(),
            }, {
              onConflict: "token_address",
            });

          if (error) {
            results.errors.push(`Failed to insert token ${args.tokenAddress}: ${error.message}`);
          } else {
            results.tokensIndexed++;

            // Generate initial price history for the new token
            try {
              const initialPriceETH = parseFloat(ethers.formatEther(args.initialLiquidityETH)) / 1000000;
              const historyResponse = await fetch(`${supabaseUrl}/functions/v1/generate-initial-history`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  tokenAddress: args.tokenAddress.toLowerCase(),
                  initialPriceETH: initialPriceETH,
                  initialEthReserve: parseFloat(ethers.formatEther(args.initialLiquidityETH)),
                  initialTokenReserve: 1000000,
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

    // Index swaps
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
                  .insert({
                    token_address: token.token_address,
                    amm_address: token.amm_address,
                    user_address: args.user.toLowerCase(),
                    eth_in: ethers.formatEther(args.ethIn),
                    token_in: ethers.formatEther(args.tokenIn),
                    eth_out: ethers.formatEther(args.ethOut),
                    token_out: ethers.formatEther(args.tokenOut),
                    tx_hash: event.transactionHash,
                    created_at: new Date(block.timestamp * 1000).toISOString(),
                  });

                if (swapError) {
                  results.errors.push(`Failed to insert swap: ${swapError.message}`);
                } else {
                  results.swapsIndexed++;

                  // Update token reserves and volume
                  const [reserveETH, reserveToken] = await Promise.all([
                    amm.reserveETH(),
                    amm.reserveToken(),
                  ]);

                  // Calculate volume from this swap (sum of ETH in and out)
                  const ethVolume = parseFloat(ethers.formatEther(args.ethIn)) +
                                    parseFloat(ethers.formatEther(args.ethOut));

                  // Get current volume
                  const { data: currentToken } = await supabase
                    .from("tokens")
                    .select("total_volume_eth")
                    .eq("token_address", token.token_address)
                    .single();

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

    // Update platform stats after indexing
    if (results.swapsIndexed > 0 || results.tokensIndexed > 0) {
      try {
        await supabase.rpc('update_platform_stats');
      } catch (err: any) {
        results.errors.push(`Failed to update platform stats: ${err.message}`);
      }
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