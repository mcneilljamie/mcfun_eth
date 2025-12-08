import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { supabase, PriceSnapshot } from '../lib/supabase';
import { formatUSD } from '../lib/utils';
import { getEthPriceUSD } from '../lib/ethPrice';

interface PriceChartProps {
  tokenAddress: string;
  tokenSymbol: string;
}

export function PriceChart({ tokenAddress }: PriceChartProps) {
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'1H' | '24H' | '7D' | 'ALL'>('24H');
  const [ethPriceUSD, setEthPriceUSD] = useState<number>(3000);
  const [tokenCreatedAt, setTokenCreatedAt] = useState<string | null>(null);

  useEffect(() => {
    loadPriceHistory();
    loadEthPrice();
    loadTokenCreatedAt();

    const interval = setInterval(loadEthPrice, 60000);
    return () => clearInterval(interval);
  }, [tokenAddress, timeframe]);

  const loadEthPrice = async () => {
    const price = await getEthPriceUSD();
    setEthPriceUSD(price);
  };

  const loadTokenCreatedAt = async () => {
    try {
      const { data, error } = await supabase
        .from('tokens')
        .select('created_at')
        .eq('token_address', tokenAddress)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setTokenCreatedAt(data.created_at);
      }
    } catch (err) {
      console.error('Failed to load token created_at:', err);
    }
  };

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

  const pricesETH = snapshots.map((s) => parseFloat(s.price_eth));
  const pricesUSD = pricesETH.map(p => p * ethPriceUSD);
  const minPrice = Math.min(...pricesUSD);
  const maxPrice = Math.max(...pricesUSD);
  const currentPrice = pricesUSD[pricesUSD.length - 1];
  const firstPrice = pricesUSD[0];
  const priceChange = ((currentPrice - firstPrice) / firstPrice) * 100;

  const width = 800;
  const height = 300;
  const paddingLeft = 80;
  const paddingRight = 40;
  const paddingTop = 40;
  const paddingBottom = 60;

  const points = snapshots.map((snapshot, index) => {
    const x = paddingLeft + (index / (snapshots.length - 1)) * (width - paddingLeft - paddingRight);
    const priceUSD = pricesUSD[index];
    const y = paddingTop + ((maxPrice - priceUSD) / (maxPrice - minPrice)) * (height - paddingTop - paddingBottom);
    return { x, y, timestamp: snapshot.created_at };
  });

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const formatTimeSinceDeployment = (timestamp: string) => {
    if (!tokenCreatedAt) return '';
    const deployTime = new Date(tokenCreatedAt).getTime();
    const snapshotTime = new Date(timestamp).getTime();
    const diffMs = snapshotTime - deployTime;

    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);

    if (timeframe === '1H') {
      return `${minutes}m`;
    } else if (timeframe === '24H') {
      return `${hours}h`;
    } else if (timeframe === '7D') {
      return `${days}d`;
    } else {
      if (weeks > 0) return `${weeks}w`;
      return `${days}d`;
    }
  };

  const yAxisLabels = 5;
  const yAxisValues = Array.from({ length: yAxisLabels }, (_, i) => {
    return minPrice + (maxPrice - minPrice) * (i / (yAxisLabels - 1));
  }).reverse();

  const xAxisLabels = Math.min(6, snapshots.length);
  const xAxisIndices = Array.from({ length: xAxisLabels }, (_, i) => {
    return Math.floor((i / (xAxisLabels - 1)) * (snapshots.length - 1));
  });

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Price Chart</h3>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-2xl font-bold text-gray-900">
              {formatUSD(currentPrice, false)}
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
            d={`${pathData} L ${points[points.length - 1].x} ${height - paddingBottom} L ${paddingLeft} ${height - paddingBottom} Z`}
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
            x1={paddingLeft}
            y1={height - paddingBottom}
            x2={width - paddingRight}
            y2={height - paddingBottom}
            stroke="#E5E7EB"
            strokeWidth="1"
          />

          <line
            x1={paddingLeft}
            y1={paddingTop}
            x2={paddingLeft}
            y2={height - paddingBottom}
            stroke="#E5E7EB"
            strokeWidth="1"
          />

          {yAxisValues.map((value, index) => {
            const y = paddingTop + (index / (yAxisLabels - 1)) * (height - paddingTop - paddingBottom);
            return (
              <g key={`y-${index}`}>
                <line
                  x1={paddingLeft - 5}
                  y1={y}
                  x2={paddingLeft}
                  y2={y}
                  stroke="#9CA3AF"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill="#6B7280"
                >
                  {formatUSD(value, true)}
                </text>
              </g>
            );
          })}

          {xAxisIndices.map((snapshotIndex, index) => {
            const point = points[snapshotIndex];
            const label = formatTimeSinceDeployment(snapshots[snapshotIndex].created_at);
            return (
              <g key={`x-${index}`}>
                <line
                  x1={point.x}
                  y1={height - paddingBottom}
                  x2={point.x}
                  y2={height - paddingBottom + 5}
                  stroke="#9CA3AF"
                  strokeWidth="1"
                />
                <text
                  x={point.x}
                  y={height - paddingBottom + 20}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#6B7280"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200">
        <div>
          <div className="text-sm text-gray-600">High</div>
          <div className="font-semibold text-gray-900">{formatUSD(maxPrice, false)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-600">Low</div>
          <div className="font-semibold text-gray-900">{formatUSD(minPrice, false)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-600">Data Points</div>
          <div className="font-semibold text-gray-900">{snapshots.length}</div>
        </div>
      </div>
    </div>
  );
}
