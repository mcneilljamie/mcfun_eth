import { supabase } from './supabase';

let cachedEthPrice: number | null = null;
let lastFetch = 0;
const CACHE_DURATION = 60000;

async function getEthPriceFromDB(): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('eth_price_history')
      .select('price_usd')
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data?.price_usd ? parseFloat(data.price_usd) : null;
  } catch (err) {
    console.error('Failed to fetch ETH price from DB:', err);
    return null;
  }
}

export async function getEthPriceUSD(): Promise<number> {
  const now = Date.now();

  if (cachedEthPrice && now - lastFetch < CACHE_DURATION) {
    return cachedEthPrice;
  }

  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await response.json();

    if (data.ethereum?.usd) {
      cachedEthPrice = data.ethereum.usd;
      lastFetch = now;
      return cachedEthPrice;
    }
  } catch (err) {
    console.error('Failed to fetch ETH price from API:', err);
  }

  if (cachedEthPrice) {
    return cachedEthPrice;
  }

  const dbPrice = await getEthPriceFromDB();
  if (dbPrice) {
    cachedEthPrice = dbPrice;
    lastFetch = now;
    return cachedEthPrice;
  }

  return 0;
}
