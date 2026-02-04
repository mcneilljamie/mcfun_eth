import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ethers } from "npm:ethers@6.16.0";
import { getClientIP } from "../_shared/auth.ts";
import { checkRateLimit, createRateLimitResponse } from "../_shared/rateLimit.ts";
import { getFactoryAddress, getRPCProviders } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Get configuration from shared config (with mainnet defaults)
const FACTORY_ADDRESS = getFactoryAddress();
const RPC_PROVIDERS = getRPCProviders();

const FACTORY_ABI = [
  "event TokenLaunched(address indexed tokenAddress, address indexed ammAddress, string name, string symbol, address indexed creator, uint256 liquidityPercent, uint256 initialLiquidityETH)"
];

interface RegisterRequest {
  txHash: string;
  tokenAddress: string;
  ammAddress: string;
  name: string;
  symbol: string;
  website?: string;
  telegramUrl?: string;
  discordUrl?: string;
  xUrl?: string;
}

async function createProviderWithFailover(): Promise<ethers.JsonRpcProvider> {
  for (const providerUrl of RPC_PROVIDERS) {
    try {
      const provider = new ethers.JsonRpcProvider(providerUrl);
      await provider.getBlockNumber();
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

  const clientIP = getClientIP(req);
  const rateLimitResult = await checkRateLimit(
    clientIP,
    "register-token-launch",
    5,
    60
  );

  if (!rateLimitResult.allowed) {
    console.warn(`Rate limit exceeded for IP ${clientIP} on register-token-launch`);
    return createRateLimitResponse(
      rateLimitResult.error || "Rate limit exceeded",
      corsHeaders
    );
  }

  try {
    const {
      txHash,
      tokenAddress,
      ammAddress,
      name,
      symbol,
      website,
      telegramUrl,
      discordUrl,
      xUrl,
    }: RegisterRequest = await req.json();

    if (!txHash || !tokenAddress || !ammAddress || !name || !symbol) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const provider = await createProviderWithFailover();

    console.log(`Validating token launch for tx: ${txHash}`);

    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return new Response(
        JSON.stringify({ error: "Transaction not found or not yet confirmed" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (receipt.status !== 1) {
      return new Response(
        JSON.stringify({ error: "Transaction failed on blockchain" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const factoryInterface = new ethers.Interface(FACTORY_ABI);
    let tokenLaunchedEvent = null;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== FACTORY_ADDRESS.toLowerCase()) {
        continue;
      }

      try {
        const parsed = factoryInterface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });

        if (parsed && parsed.name === "TokenLaunched") {
          tokenLaunchedEvent = parsed;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!tokenLaunchedEvent) {
      return new Response(
        JSON.stringify({
          error: "No valid TokenLaunched event found in transaction. This transaction did not launch a token through the official factory."
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const eventTokenAddress = tokenLaunchedEvent.args.tokenAddress.toLowerCase();
    const eventAmmAddress = tokenLaunchedEvent.args.ammAddress.toLowerCase();
    const eventName = tokenLaunchedEvent.args.name;
    const eventSymbol = tokenLaunchedEvent.args.symbol;
    const eventCreator = tokenLaunchedEvent.args.creator.toLowerCase();
    const eventLiquidityPercent = Number(tokenLaunchedEvent.args.liquidityPercent);
    const eventInitialLiquidityETH = ethers.formatEther(tokenLaunchedEvent.args.initialLiquidityETH);

    if (eventTokenAddress !== tokenAddress.toLowerCase()) {
      return new Response(
        JSON.stringify({
          error: `Token address mismatch. Expected ${tokenAddress}, but event shows ${eventTokenAddress}`
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (eventAmmAddress !== ammAddress.toLowerCase()) {
      return new Response(
        JSON.stringify({
          error: `AMM address mismatch. Expected ${ammAddress}, but event shows ${eventAmmAddress}`
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const block = await provider.getBlock(receipt.blockNumber);
    if (!block) {
      return new Response(
        JSON.stringify({ error: "Could not fetch block data" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const initialTokenReserve = 1000000 * eventLiquidityPercent / 100;
    const launchPriceEth = parseFloat(eventInitialLiquidityETH) / initialTokenReserve;

    // Get ETH price at the time of token launch
    const launchTimestamp = new Date(block.timestamp * 1000).toISOString();
    const { data: ethPriceData } = await supabase
      .from("eth_price_history")
      .select("price_usd")
      .lte("timestamp", launchTimestamp)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ethPriceUsd = ethPriceData?.price_usd || 3000;

    const { error: insertError } = await supabase
      .from("tokens")
      .upsert({
        token_address: eventTokenAddress,
        amm_address: eventAmmAddress,
        name: eventName,
        symbol: eventSymbol,
        creator_address: eventCreator,
        liquidity_percent: eventLiquidityPercent,
        initial_liquidity_eth: eventInitialLiquidityETH,
        launch_price_eth: launchPriceEth.toString(),
        current_eth_reserve: eventInitialLiquidityETH,
        current_token_reserve: initialTokenReserve.toString(),
        total_volume_eth: "0",
        website: website?.trim() || null,
        telegram_url: telegramUrl?.trim() || null,
        discord_url: discordUrl?.trim() || null,
        x_url: xUrl?.trim() || null,
        created_at: new Date(block.timestamp * 1000).toISOString(),
        block_number: block.number,
        block_hash: block.hash,
      }, {
        onConflict: "token_address",
      });

    if (insertError) {
      console.error("Database insert error:", insertError);
      return new Response(
        JSON.stringify({ error: `Failed to register token: ${insertError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    try {
      const historyResponse = await fetch(`${supabaseUrl}/functions/v1/generate-initial-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          tokenAddress: eventTokenAddress,
          initialPriceETH: launchPriceEth,
          initialEthReserve: parseFloat(eventInitialLiquidityETH),
          initialTokenReserve: initialTokenReserve,
          createdAt: new Date(block.timestamp * 1000).toISOString(),
          hoursOfHistory: 24,
        }),
      });

      if (!historyResponse.ok) {
        console.error(`Failed to generate initial history: ${await historyResponse.text()}`);
      }
    } catch (historyErr) {
      console.error(`Error generating initial history:`, historyErr);
    }

    console.log(`Successfully registered token ${eventTokenAddress} from tx ${txHash}`);

    return new Response(
      JSON.stringify({
        success: true,
        token: {
          tokenAddress: eventTokenAddress,
          ammAddress: eventAmmAddress,
          name: eventName,
          symbol: eventSymbol,
          creator: eventCreator,
          liquidityPercent: eventLiquidityPercent,
          initialLiquidityETH: eventInitialLiquidityETH,
          launchPriceEth: launchPriceEth.toString(),
          blockNumber: block.number,
          blockHash: block.hash,
          timestamp: new Date(block.timestamp * 1000).toISOString(),
        }
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: any) {
    console.error("Error in register-token-launch:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
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