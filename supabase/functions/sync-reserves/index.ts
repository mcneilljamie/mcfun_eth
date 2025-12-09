import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const AMM_ABI = [
  "function reserveToken() external view returns (uint256)",
  "function reserveETH() external view returns (uint256)"
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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const rpcUrl = Deno.env.get("ETHEREUM_RPC_URL") || "https://rpc.sepolia.org";

    const supabase = createClient(supabaseUrl, supabaseKey);
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const { data: tokens, error: tokensError } = await supabase
      .from("tokens")
      .select("token_address, amm_address, symbol");

    if (tokensError) {
      throw new Error(`Failed to fetch tokens: ${tokensError.message}`);
    }

    const results = {
      tokensUpdated: 0,
      errors: [] as string[],
    };

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "No tokens found", ...results }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    for (const token of tokens) {
      try {
        const amm = new ethers.Contract(token.amm_address, AMM_ABI, provider);
        
        const [reserveETH, reserveToken] = await Promise.all([
          amm.reserveETH(),
          amm.reserveToken(),
        ]);

        const ethReserveFormatted = ethers.formatEther(reserveETH);
        const tokenReserveFormatted = ethers.formatEther(reserveToken);

        const { error: updateError } = await supabase
          .from("tokens")
          .update({
            current_eth_reserve: ethReserveFormatted,
            current_token_reserve: tokenReserveFormatted,
          })
          .eq("token_address", token.token_address);

        if (updateError) {
          results.errors.push(`Failed to update ${token.symbol}: ${updateError.message}`);
        } else {
          results.tokensUpdated++;
        }
      } catch (err: any) {
        results.errors.push(`Failed to process ${token.symbol}: ${err.message}`);
      }
    }

    // Update platform stats after syncing reserves
    try {
      await supabase.rpc('update_platform_stats');
    } catch (err: any) {
      results.errors.push(`Failed to update platform stats: ${err.message}`);
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
    console.error("Error in sync-reserves:", err);
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
