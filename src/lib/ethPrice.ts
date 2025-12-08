let cachedEthPrice = 3000;
let lastFetch = 0;
const CACHE_DURATION = 60000;

export async function getEthPriceUSD(): Promise<number> {
  const now = Date.now();

  if (now - lastFetch < CACHE_DURATION) {
    return cachedEthPrice;
  }

  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await response.json();

    if (data.ethereum?.usd) {
      cachedEthPrice = data.ethereum.usd;
      lastFetch = now;
    }
  } catch (err) {
    console.error('Failed to fetch ETH price:', err);
  }

  return cachedEthPrice;
}
