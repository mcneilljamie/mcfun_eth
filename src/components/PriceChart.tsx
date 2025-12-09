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

export function PriceChart({ tokenAddress, ammAddress, tokenSymbol }: PriceChartProps) {
  const [snapshots, setSnapshots] = useState<LocalSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ethPriceUSD, setEthPriceUSD] = useState<number>(3000);
  const [currentPriceETH, setCurrentPriceETH] = useState<number>(0);
  const { provider } = useWeb3();
  const localSnapshotsRef = useRef<LocalSnapshot[]>([]);
  const [tokenAge, setTokenAge] = useState<number>(0);

  useEffect(() => {
    loadPriceHistory();
    loadEthPrice();
    checkTokenAge();

    const ethPriceInterval = setInterval(loadEthPrice, 60000);

    const livePriceInterval = setInterval(async () => {
      if (provider && ammAddress) {
        await captureLocalSnapshot();
      }
    }, 15000);

    return () => {
      clearInterval(ethPriceInterval);
      clearInterval(livePriceInterval);
    };
  }, [tokenAddress, provider, ammAddress]);

  const loadEthPrice = async () => {
    const price = await getEthPriceUSD();
    setEthPriceUSD(price);
  };

  const checkTokenAge = async () => {
    try {
      const { data } = await supabase
        .from('tokens')
        .select('created_at')
        .eq('token_address', tokenAddress)
        .maybeSingle();

      if (data) {
        const age = Date.now() - new Date(data.created_at).getTime();
        setTokenAge(age);
      }
    } catch (err) {
      console.error('Failed to check token age:', err);
    }
  };

  const captureLocalSnapshot = async () => {
    if (!provider || !ammAddress) return;

    try {
      const priceETH = await getPrice(provider, ammAddress);
      const priceValue = parseFloat(priceETH);

      if (priceValue > 0) {
        setCurrentPriceETH(priceValue);

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

        const existingSnapshots = localSnapshotsRef.current;
        const lastSnapshot = existingSnapshots[existingSnapshots.length - 1];

        if (!lastSnapshot || new Date(newSnapshot.created_at).getTime() - new Date(lastSnapshot.created_at).getTime() >= 10000) {
          localSnapshotsRef.current = [...existingSnapshots, newSnapshot].slice(-50);
          mergeSnapshots();
        }
      }
    } catch (err) {
      console.error('Failed to capture local snapshot:', err);
    }
  };

  const aggregateDataPoints = (data: LocalSnapshot[], targetPoints: number): LocalSnapshot[] => {
    if (data.length <= targetPoints) return data;

    const interval = Math.ceil(data.length / targetPoints);
    const aggregated: LocalSnapshot[] = [];

    for (let i = 0; i < data.length; i += interval) {
      const chunk = data.slice(i, Math.min(i + interval, data.length));
      const avgPrice = chunk.reduce((sum, s) => sum + parseFloat(s.price_eth), 0) / chunk.length;
      const avgEthReserve = chunk.reduce((sum, s) => sum + parseFloat(s.eth_reserve || '0'), 0) / chunk.length;
      const avgTokenReserve = chunk.reduce((sum, s) => sum + parseFloat(s.token_reserve || '0'), 0) / chunk.length;

      aggregated.push({
        ...chunk[Math.floor(chunk.length / 2)],
        price_eth: avgPrice.toString(),
        eth_reserve: avgEthReserve.toString(),
        token_reserve: avgTokenReserve.toString(),
      });
    }

    return aggregated;
  };

  const mergeSnapshots = () => {
    setSnapshots(prev => {
      const dbSnapshots = prev.filter(s => !s.is_local);
      const localSnapshots = localSnapshotsRef.current;
      const allSnapshots = [...dbSnapshots, ...localSnapshots];

      const sorted = allSnapshots.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      const uniqueSnapshots = sorted.filter((snapshot, index, self) =>
        index === self.findIndex(s =>
          Math.abs(new Date(s.created_at).getTime() - new Date(snapshot.created_at).getTime()) < 5000
        )
      );

      return uniqueSnapshots;
    });
  };

  const loadPriceHistory = async () => {
    setIsLoading(true);
    localSnapshotsRef.current = [];

    try {
      const { data, error } = await supabase
        .from('price_snapshots')
        .select('*')
        .eq('token_address', tokenAddress)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const aggregated = aggregateDataPoints(data, 200);
        setSnapshots(aggregated);
      } else {
        setSnapshots([]);
      }
    } catch (err) {
      console.error('Failed to load price history:', err);
      setSnapshots([]);
    } finally {
      setIsLoading(false);
    }

    if (provider && ammAddress) {
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

  const isVeryNewToken = tokenAge > 0 && tokenAge < 3600000;

  if (snapshots.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Price Chart</h3>
        {provider && ammAddress && currentPriceETH > 0 ? (
          <div className="text-center py-8">
            <div className="mb-4">
              <div className="text-sm text-gray-600 mb-2">Current Price</div>
              <div className="text-3xl font-bold text-gray-900">
                {formatUSD(currentPriceETH * ethPriceUSD, false)}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {currentPriceETH.toFixed(10)} ETH
              </div>
            </div>
            <div className="text-gray-500 text-sm">
              {isVeryNewToken
                ? 'Building price history... Chart will appear after a few minutes of activity'
                : 'No historical price data available yet'}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No price data available yet
          </div>
        )}
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

  const firstPrice = pricesUSD[0] || currentPriceUSD;
  const priceChange = firstPrice > 0 ? ((currentPriceUSD - firstPrice) / firstPrice) * 100 : 0;
  const isPositiveChange = priceChange >= 0;

  let chartData: ChartDataPoint[] = snapshots.map((snapshot, index) => ({
    time: Math.floor(new Date(snapshot.created_at).getTime() / 1000),
    value: pricesUSD[index]
  }));

  if (currentPriceETH > 0) {
    chartData.push({
      time: Math.floor(Date.now() / 1000),
      value: currentPriceUSD
    });
  }

  chartData = chartData.filter((point, index, arr) =>
    point.value > 0 && (index === 0 || point.time > arr[index - 1].time)
  );

  if (chartData.length < 2) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Price Chart</h3>
        <div className="text-center py-8">
          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-2">Current Price</div>
            <div className="text-3xl font-bold text-gray-900">
              {formatUSD(currentPriceUSD, false)}
            </div>
          </div>
          <div className="text-gray-500 text-sm">
            Collecting more data points to display chart...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex flex-col gap-4 mb-4">
        <h3 className="text-lg font-bold text-gray-900">Price Chart</h3>
        <div className="flex items-center space-x-2">
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
