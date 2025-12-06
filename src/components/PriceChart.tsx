import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { supabase, PriceSnapshot } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';

interface PriceChartProps {
  tokenAddress: string;
  tokenSymbol: string;
}

export function PriceChart({ tokenAddress }: PriceChartProps) {
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'1H' | '24H' | '7D' | 'ALL'>('24H');

  useEffect(() => {
    loadPriceHistory();
  }, [tokenAddress, timeframe]);

  const loadPriceHistory = async () => {
    setIsLoading(true);

    try {
      let query = supabase
        .from('price_snapshots')
        .select('*')
        .eq('token_address', tokenAddress)
        .order('created_at', { ascending: true });

      const now = new Date();
      let cutoffDate = new Date();

      switch (timeframe) {
        case '1H':
          cutoffDate.setHours(now.getHours() - 1);
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
    } catch (err) {
      console.error('Failed to load price history:', err);
    } finally {
      setIsLoading(false);
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

  const prices = snapshots.map((s) => parseFloat(s.price_eth));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const currentPrice = prices[prices.length - 1];
  const firstPrice = prices[0];
  const priceChange = ((currentPrice - firstPrice) / firstPrice) * 100;

  const width = 800;
  const height = 300;
  const padding = 40;

  const points = snapshots.map((snapshot, index) => {
    const x = padding + (index / (snapshots.length - 1)) * (width - 2 * padding);
    const price = parseFloat(snapshot.price_eth);
    const y = height - padding - ((price - minPrice) / (maxPrice - minPrice)) * (height - 2 * padding);
    return { x, y };
  });

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Price Chart</h3>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-2xl font-bold text-gray-900">
              {formatCurrency(currentPrice)}
            </span>
            <span className={`flex items-center text-sm font-medium ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {priceChange >= 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
              {Math.abs(priceChange).toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="flex space-x-2">
          {(['1H', '24H', '7D', 'ALL'] as const).map((tf) => (
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

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
          <defs>
            <linearGradient id="priceGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#111827" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#111827" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path
            d={`${pathData} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`}
            fill="url(#priceGradient)"
          />

          <path
            d={pathData}
            fill="none"
            stroke="#111827"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r="3"
              fill="#111827"
              className="opacity-0 hover:opacity-100 transition-opacity"
            />
          ))}

          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="#E5E7EB"
            strokeWidth="1"
          />

          <line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={height - padding}
            stroke="#E5E7EB"
            strokeWidth="1"
          />
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200">
        <div>
          <div className="text-sm text-gray-600">24h High</div>
          <div className="font-semibold text-gray-900">{formatCurrency(maxPrice)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-600">24h Low</div>
          <div className="font-semibold text-gray-900">{formatCurrency(minPrice)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-600">Data Points</div>
          <div className="font-semibold text-gray-900">{snapshots.length}</div>
        </div>
      </div>
    </div>
  );
}
