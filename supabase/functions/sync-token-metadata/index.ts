import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RPC_URL = Deno.env.get("RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com";

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
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

    // Get token address from request or sync all tokens
    let tokenAddresses: string[] = [];

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.tokenAddress) {
          tokenAddresses = [body.tokenAddress.toLowerCase()];
        } else if (body.tokenAddresses) {
          tokenAddresses = body.tokenAddresses.map((addr: string) => addr.toLowerCase());
        }
      } catch {
        // If no body or parse error, sync all tokens
      }
    }

    // If no specific tokens provided, get all tokens
    if (tokenAddresses.length === 0) {
      const { data: tokens, error } = await supabase
        .from("tokens")
        .select("token_address");

      if (error) {
        throw new Error(`Failed to fetch tokens: ${error.message}`);
      }

      tokenAddresses = tokens?.map(t => t.token_address) || [];
    }

    console.log(`Syncing metadata for ${tokenAddresses.length} tokens`);

    const results = {
      updated: 0,
      failed: 0,
      errors: [] as any[],
    };

    for (const tokenAddress of tokenAddresses) {
      try {
        console.log(`Syncing ${tokenAddress}...`);

        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const [name, symbol] = await Promise.all([
          tokenContract.name(),
          tokenContract.symbol(),
        ]);

        console.log(`  On-chain: ${name} (${symbol})`);

        // Check if data needs updating
        const { data: currentToken } = await supabase
          .from("tokens")
          .select("name, symbol")
          .eq("token_address", tokenAddress)
          .maybeSingle();

        if (currentToken) {
          if (currentToken.name !== name || currentToken.symbol !== symbol) {
            console.log(`  Updating: ${currentToken.name} (${currentToken.symbol}) -> ${name} (${symbol})`);

            const { error: updateError } = await supabase
              .from("tokens")
              .update({
                name: name,
                symbol: symbol,
              })
              .eq("token_address", tokenAddress);

            if (updateError) {
              throw updateError;
            }

            results.updated++;
          } else {
            console.log(`  No changes needed`);
          }
        }
      } catch (err: any) {
        console.error(`Failed to sync ${tokenAddress}:`, err);
        results.failed++;
        results.errors.push({
          tokenAddress,
          error: err.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
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
