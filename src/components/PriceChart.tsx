import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { supabase, PriceSnapshot } from '../lib/supabase';
import { formatUSD } from '../lib/utils';
import { getEthPriceUSD } from '../lib/ethPrice';
import { useWeb3 } from '../lib/web3';
import { getPrice } from '../lib/contracts';
import { TradingViewChart, ChartDataPoint } from './TradingViewChart';

interface PriceChartProps {
  tokenAddress: string;
  tokenSymbol: string;
  ammAddress: string;
}

interface LocalSnapshot {
  created_at: string;
  price_eth: string;
  eth_reserve: string;
  token_reserve: string;
  id: string;
  token_address: string;
  eth_price_usd?: string;
  is_local?: boolean;
}

export function PriceChart({ tokenAddress, ammAddress }: PriceChartProps) {
  const [snapshots, setSnapshots] = useState<LocalSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'15M' | '24H' | '7D' | 'ALL'>('24H');
  const [ethPriceUSD, setEthPriceUSD] = useState<number>(3000);
  const [currentPriceETH, setCurrentPriceETH] = useState<number>(0);
  const { provider } = useWeb3();
  const localSnapshotsRef = useRef<LocalSnapshot[]>([]);

  useEffect(() => {
    loadPriceHistory();
    loadEthPrice();

    if (provider && ammAddress) {
      captureLocalSnapshot();
    }

    const ethPriceInterval = setInterval(loadEthPrice, 60000);

    const livePriceInterval = setInterval(async () => {
      if (provider && ammAddress) {
        await captureLocalSnapshot();
      }
    }, 30000);

    return () => {
      clearInterval(ethPriceInterval);
      clearInterval(livePriceInterval);
    };
  }, [tokenAddress, provider, ammAddress]);

  useEffect(() => {
    loadPriceHistory(false);
  }, [timeframe]);

  const loadEthPrice = async () => {
    const price = await getEthPriceUSD();
    setEthPriceUSD(price);
  };

  const captureLocalSnapshot = async () => {
    if (!provider || !ammAddress) return;

    try {
      const priceETH = await getPrice(provider, ammAddress);
      setCurrentPriceETH(parseFloat(priceETH));

      const newSnapshot: LocalSnapshot = {
        created_at: new Date().toISOString(),
        price_eth: priceETH,
        eth_reserve: '0',
        token_reserve: '0',
        id: `local-${Date.now()}`,
        token_address: tokenAddress,
        eth_price_usd: ethPriceUSD.toString(),
        is_local: true,
      };

      localSnapshotsRef.current = [...localSnapshotsRef.current, newSnapshot];

      if (localSnapshotsRef.current.length > 100) {
        localSnapshotsRef.current = localSnapshotsRef.current.slice(-100);
      }

      mergeSnapshots();
    } catch (err) {
      console.error('Failed to capture local snapshot:', err);
    }
  };

  const mergeSnapshots = () => {
    const now = new Date();
    let cutoffDate = new Date();

    switch (timeframe) {
      case '15M':
        cutoffDate.setMinutes(now.getMinutes() - 15);
        break;
      case '24H':
        cutoffDate.setHours(now.getHours() - 24);
        break;
      case '7D':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case 'ALL':
        cutoffDate = new Date(0);
        break;
    }

    const filteredLocal = localSnapshotsRef.current.filter(
      s => new Date(s.created_at) >= cutoffDate
    );

    setSnapshots(prev => {
      const dbSnapshots = prev.filter(s => !s.is_local);
      const allSnapshots = [...dbSnapshots, ...filteredLocal];
      return allSnapshots.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  };

  const loadPriceHistory = async (clearLocal = true) => {
    setIsLoading(true);

    if (clearLocal) {
      localSnapshotsRef.current = [];
    }

    try {
      let query = supabase
        .from('price_snapshots')
        .select('*')
        .eq('token_address', tokenAddress)
        .order('created_at', { ascending: true });

      const now = new Date();
      let cutoffDate = new Date();

      switch (timeframe) {
        case '15M':
          cutoffDate.setMinutes(now.getMinutes() - 15);
          break;
        case '24H':
          cutoffDate.setHours(now.getHours() - 24);
          break;
        case '7D':
          cutoffDate.setDate(now.getDate() - 7);
          break;
        case 'ALL':
          break;
      }

      if (timeframe !== 'ALL') {
        query = query.gte('created_at', cutoffDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        setSnapshots(data);
      }

      mergeSnapshots();
    } catch (err) {
      console.error('Failed to load price history:', err);
    } finally {
      setIsLoading(false);
    }

    if (provider && ammAddress && clearLocal) {
      await captureLocalSnapshot();
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-4 text-gray-600">Loading chart...</p>
        </div>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Price Chart</h3>
        <div className="text-center py-8 text-gray-500">
          No price data available yet
        </div>
      </div>
    );
  }

  const pricesETH = snapshots.map((s) => parseFloat(s.price_eth));
  const pricesUSD = snapshots.map((snapshot, index) => {
    const priceETH = pricesETH[index];
    const historicalEthPrice = snapshot.eth_price_usd ? parseFloat(snapshot.eth_price_usd) : ethPriceUSD;
    return priceETH * historicalEthPrice;
  });

  const currentPriceUSD = currentPriceETH > 0
    ? currentPriceETH * ethPriceUSD
    : pricesUSD[pricesUSD.length - 1] || 0;

  const firstPrice = pricesUSD[0];
  const priceChange = ((currentPriceUSD - firstPrice) / firstPrice) * 100;
  const isPositiveChange = priceChange >= 0;

  const snapshotsWithCurrent = [...snapshots, {
    created_at: new Date().toISOString(),
    price_eth: currentPriceETH.toString(),
    eth_reserve: '0',
    token_reserve: '0',
    id: 'current',
    token_address: tokenAddress
  } as LocalSnapshot];

  const allPricesUSD = [...pricesUSD, currentPriceUSD];

  const chartData: ChartDataPoint[] = snapshotsWithCurrent.map((snapshot, index) => ({
    time: Math.floor(new Date(snapshot.created_at).getTime() / 1000),
    value: allPricesUSD[index]
  }));

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900">Price Chart</h3>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-2xl font-bold text-gray-900">
              {formatUSD(currentPriceUSD, false)}
            </span>
            <span
              className={`flex items-center text-sm font-medium ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              {priceChange >= 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
              {Math.abs(priceChange).toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="flex space-x-2">
          {(['15M', '24H', '7D', 'ALL'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <TradingViewChart
          data={chartData}
          height={350}
          isPositive={isPositiveChange}
        />
      </div>
    </div>
  );
}
