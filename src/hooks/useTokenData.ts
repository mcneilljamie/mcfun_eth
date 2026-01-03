import { useState, useEffect } from 'react';
import { Token } from '../lib/supabase';
import { useChartData } from './useChartData';
import { useLiveReserves } from './useLiveReserves';
import { getEthPriceUSD } from '../lib/ethPrice';

export interface TokenData {
  token: Token;
  currentPriceUSD: number;
  marketCap: number;
  priceChange: number | null;
  priceChangeSinceLaunch: number | null;
  liquidityETH: string;
  liquidityUSD: number;
  isNew: boolean;
}

export function useTokenData(provider: any, token: Token | null, refreshInterval: number = 30000) {
  const [ethPriceUSD, setEthPriceUSD] = useState<number>(3000);
  const [tokenData, setTokenData] = useState<TokenData | null>(null);

  const { reserves: liveReserves } = useLiveReserves(
    provider,
    token?.amm_address || null,
    refreshInterval
  );

  const {
    priceChange,
    priceChangeSinceLaunch,
    currentPrice: chartPrice,
    isNew
  } = useChartData(token?.token_address, 'ALL');

  useEffect(() => {
    const loadEthPrice = async () => {
      const price = await getEthPriceUSD();
      setEthPriceUSD(price);
    };

    loadEthPrice();
    const interval = setInterval(loadEthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!token) {
      setTokenData(null);
      return;
    }

    const calculatePrice = (): number => {
      // Priority 1: Use live reserves from blockchain (most accurate, real-time)
      if (liveReserves) {
        const ethReserve = parseFloat(liveReserves.reserveETH);
        const tokenReserve = parseFloat(liveReserves.reserveToken);

        if (tokenReserve === 0) return 0;

        const priceInEth = ethReserve / tokenReserve;
        return priceInEth * ethPriceUSD;
      }

      // Priority 2: Use chart price from database
      if (chartPrice > 0) return chartPrice;

      // Priority 3: Fallback to stored reserves
      const ethReserve = parseFloat(token.current_eth_reserve?.toString() || token.initial_liquidity_eth.toString());
      const tokenReserve = parseFloat(token.current_token_reserve?.toString() || '1000000');

      if (tokenReserve === 0) return 0;

      const priceInEth = ethReserve / tokenReserve;
      return priceInEth * ethPriceUSD;
    };

    const currentPriceUSD = calculatePrice();
    const TOKEN_TOTAL_SUPPLY = 1000000;
    const marketCap = currentPriceUSD * TOKEN_TOTAL_SUPPLY;

    const liquidityETH = liveReserves?.reserveETH || token.current_eth_reserve?.toString() || token.initial_liquidity_eth.toString();
    const liquidityUSD = parseFloat(liquidityETH) * ethPriceUSD;

    setTokenData({
      token,
      currentPriceUSD,
      marketCap,
      priceChange,
      priceChangeSinceLaunch,
      liquidityETH,
      liquidityUSD,
      isNew
    });
  }, [token, liveReserves, chartPrice, priceChange, priceChangeSinceLaunch, ethPriceUSD, isNew]);

  return tokenData;
}
