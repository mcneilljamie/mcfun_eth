import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { supabase, PriceSnapshot } from '../lib/supabase';
import { formatUSD } from '../lib/utils';
import { getEthPriceUSD } from '../lib/ethPrice';

interface PriceChartProps {
  tokenAddress: string;
  tokenSymbol: string;
  currentPriceUSD: number;
}

export function PriceChart({ tokenAddress, currentPriceUSD }: PriceChartProps) {
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'15M' | '24H' | '7D' | 'ALL'>('24H');
  const [ethPriceUSD, setEthPriceUSD] = useState<number>(3000);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  useEffect(() => {
    loadPriceHistory();
    loadEthPrice();

    const interval = setInterval(loadEthPrice, 60000);
    return () => clearInterval(interval);
  }, [tokenAddress, timeframe]);

  const loadEthPrice = async () => {
    const price = await getEthPriceUSD();
    setEthPriceUSD(price);
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
  const pricesUSD = snapshots.map((snapshot, index) => {
    const priceETH = pricesETH[index];
    const historicalEthPrice = snapshot.eth_price_usd ? parseFloat(snapshot.eth_price_usd) : ethPriceUSD;
    return priceETH * historicalEthPrice;
  });

  pricesUSD.push(currentPriceUSD);

  const minPrice = Math.min(...pricesUSD);
  const maxPrice = Math.max(...pricesUSD);
  const firstPrice = pricesUSD[0];
  const priceChange = ((currentPriceUSD - firstPrice) / firstPrice) * 100;

  const width = 800;
  const height = 300;
  const paddingLeft = 80;
  const paddingRight = 40;
  const paddingTop = 40;
  const paddingBottom = 60;

  const snapshotsWithCurrent = [...snapshots, {
    created_at: new Date().toISOString(),
    price_eth: '0',
    eth_reserve: '0',
    token_reserve: '0',
    id: 'current',
    token_address: tokenAddress
  } as PriceSnapshot];

  const points = snapshotsWithCurrent.map((snapshot, index) => {
    const x = snapshotsWithCurrent.length > 1
      ? paddingLeft + (index / (snapshotsWithCurrent.length - 1)) * (width - paddingLeft - paddingRight)
      : paddingLeft + (width - paddingLeft - paddingRight) / 2;
    const priceUSD = pricesUSD[index];
    const priceRange = maxPrice - minPrice;
    const y = priceRange > 0
      ? paddingTop + ((maxPrice - priceUSD) / priceRange) * (height - paddingTop - paddingBottom)
      : paddingTop + (height - paddingTop - paddingBottom) / 2;
    return { x, y, timestamp: snapshot.created_at };
  });

  const createSmoothPath = (points: Array<{ x: number; y: number }>) => {
    if (points.length < 2) return `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

    const tension = 0.3;
    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[0];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i < points.length - 2 ? points[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return path;
  };

  const pathData = createSmoothPath(points);

  const formatAxisTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);

    if (timeframe === '15M' || timeframe === '24H') {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (timeframe === '7D') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const formatTooltipTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const yAxisLabels = 5;
  const yAxisValues = Array.from({ length: yAxisLabels }, (_, i) => {
    return minPrice + (maxPrice - minPrice) * (i / (yAxisLabels - 1));
  }).reverse();

  const xAxisLabels = Math.min(6, snapshotsWithCurrent.length);
  const xAxisIndices = Array.from({ length: xAxisLabels }, (_, i) => {
    if (xAxisLabels === 1) return 0;
    return Math.floor((i / (xAxisLabels - 1)) * (snapshotsWithCurrent.length - 1));
  });

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
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

      <div className="overflow-x-auto relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          onMouseMove={(e) => {
            const svg = e.currentTarget;
            const rect = svg.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * width;

            if (x < paddingLeft || x > width - paddingRight) {
              setHoveredPoint(null);
              return;
            }

            let closestIndex = 0;
            let closestDistance = Infinity;

            points.forEach((point, index) => {
              const distance = Math.abs(point.x - x);
              if (distance < closestDistance) {
                closestDistance = distance;
                closestIndex = index;
              }
            });

            setHoveredPoint(closestIndex);
          }}
          onMouseLeave={() => setHoveredPoint(null)}
        >
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
            const label = formatAxisTimestamp(snapshotsWithCurrent[snapshotIndex].created_at);
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

          {hoveredPoint !== null && (
            <g>
              <line
                x1={points[hoveredPoint].x}
                y1={paddingTop}
                x2={points[hoveredPoint].x}
                y2={height - paddingBottom}
                stroke="#111827"
                strokeWidth="1"
                strokeDasharray="4"
                opacity="0.5"
              />
              <line
                x1={paddingLeft}
                y1={points[hoveredPoint].y}
                x2={width - paddingRight}
                y2={points[hoveredPoint].y}
                stroke="#111827"
                strokeWidth="1"
                strokeDasharray="4"
                opacity="0.5"
              />
              <circle
                cx={points[hoveredPoint].x}
                cy={points[hoveredPoint].y}
                r="5"
                fill="#111827"
                stroke="white"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {hoveredPoint !== null && (() => {
          const xPercent = (points[hoveredPoint].x / width) * 100;
          const yPercent = (points[hoveredPoint].y / height) * 100;

          let translateX = '-50%';
          let translateY = '-120%';

          if (xPercent < 15) {
            translateX = '0%';
          } else if (xPercent > 85) {
            translateX = '-100%';
          }

          if (yPercent < 20) {
            translateY = '20%';
          }

          return (
            <div
              className="absolute bg-gray-900 text-white px-3 py-2 rounded-lg text-sm shadow-lg pointer-events-none whitespace-nowrap z-10"
              style={{
                left: `${xPercent}%`,
                top: `${yPercent}%`,
                transform: `translate(${translateX}, ${translateY})`,
              }}
            >
              <div className="font-semibold">{formatUSD(pricesUSD[hoveredPoint], false)}</div>
              <div className="text-xs text-gray-300">{formatTooltipTimestamp(snapshotsWithCurrent[hoveredPoint].created_at)}</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
