const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TREASURY_ADDRESS = "0x993AEe79ee816B636D80f06186325b19a0eE3D45";

const CHAINS = [
  { chainId: 1, api: "https://eth.blockscout.com/api", explorer: "https://etherscan.io" },
  { chainId: 8453, api: "https://base.blockscout.com/api", explorer: "https://basescan.org" },
];

interface Deposit {
  hash: string;
  from: string;
  valueEth: number;
  timestamp: number;
  chainId: number;
  explorerUrl: string;
}

async function fetchChainDeposits(
  chain: { chainId: number; api: string; explorer: string },
): Promise<Deposit[]> {
  const treasury = TREASURY_ADDRESS.toLowerCase();
  const actions = ["txlist", "txlistinternal"];

  const perAction = await Promise.all(
    actions.map(async (action) => {
      try {
        const url =
          `${chain.api}?module=account&action=${action}&address=${TREASURY_ADDRESS}&sort=desc&page=1&offset=50`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return [] as Deposit[];
        const json = await res.json();
        if (!Array.isArray(json?.result)) return [] as Deposit[];

        return (json.result as Array<Record<string, string>>)
          .filter((tx) =>
            (tx.to || "").toLowerCase() === treasury &&
            tx.value && tx.value !== "0" &&
            (tx.isError === undefined || tx.isError === "0")
          )
          .map((tx) => {
            const hash = tx.hash || tx.transactionHash || "";
            return {
              hash,
              from: tx.from,
              valueEth: Number(tx.value) / 1e18,
              timestamp: Number(tx.timeStamp) || 0,
              chainId: chain.chainId,
              explorerUrl: `${chain.explorer}/tx/${hash}`,
            };
          })
          .filter((dep) => dep.hash.length > 0);
      } catch (_err) {
        return [] as Deposit[];
      }
    }),
  );

  return perAction.flat();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const perChain = await Promise.all(CHAINS.map((c) => fetchChainDeposits(c)));

    const byHash = new Map<string, Deposit>();
    for (const dep of perChain.flat()) {
      const key = `${dep.chainId}-${dep.hash}`;
      const existing = byHash.get(key);
      if (!existing || dep.valueEth > existing.valueEth) {
        byHash.set(key, dep);
      }
    }

    const deposits = Array.from(byHash.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    return new Response(JSON.stringify({ deposits }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to load treasury transactions", deposits: [] }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
