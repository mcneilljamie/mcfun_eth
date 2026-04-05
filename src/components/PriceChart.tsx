import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, IChartApi, ISeriesApi, LineData, Time, AreaSeries } from 'lightweight-charts';
import { useChartData } from '../hooks/useChartData';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatPrice } from '../lib/utils';

interface PriceChartProps {
  tokenAddress: string;
  tokenSymbol: string;
  theme?: 'light' | 'dark';
}

type ChartMode = 'price' | 'marketCap';

const TOKEN_TOTAL_SUPPLY = 1000000;

export function PriceChart({ tokenAddress, tokenSymbol, theme = 'dark' }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>(() => {
    const saved = localStorage.getItem('chartMode');
    return (saved === 'price' || saved === 'marketCap') ? saved : 'price';
  });
  const { data, loading, error, priceChange: snapshotPriceChange, currentPrice, isNew, hasTraded, refetch } = useChartData(
    tokenAddress,
    'ALL'
  );

  // Always prefer database price (currentPrice) which updates in real-time via subscriptions
  // Blockchain reserves can be stale and cause chart display issues
  const displayPrice = currentPrice;
  const displayValue = chartMode === 'marketCap' ? displayPrice * TOKEN_TOTAL_SUPPLY : displayPrice;

  // Use precalculated price change from database (already accounts for compression)
  const priceChange = useMemo(() => {
    if (!hasTraded) return null;
    return snapshotPriceChange;
  }, [snapshotPriceChange, hasTraded]);

  // Save chart mode preference to localStorage
  useEffect(() => {
    localStorage.setItem('chartMode', chartMode);
  }, [chartMode]);

  const formatDisplayValue = (value: number): string => {
    if (chartMode === 'marketCap') {
      return Math.round(value).toLocaleString('en-US');
    }
    return formatPrice(value);
  };

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const isDark = theme === 'dark';
    const containerWidth = chartContainerRef.current.clientWidth;

    if (containerWidth === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: isDark ? '#1a1a1a' : '#ffffff' },
        textColor: isDark ? '#d1d5db' : '#374151',
      },
      grid: {
        vertLines: { color: isDark ? '#2a2a2a' : '#f3f4f6' },
        horzLines: { color: isDark ? '#2a2a2a' : '#f3f4f6' },
      },
      width: containerWidth,
      height: 400,
      rightPriceScale: {
        borderColor: isDark ? '#2a2a2a' : '#e5e7eb',
        scaleMargins: {
          top: 0.2,
          bottom: 0.1,
        },
        autoScale: true,
      },
      timeScale: {
        borderColor: isDark ? '#2a2a2a' : '#e5e7eb',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
      },
    });

    const baseValue = chartMode === 'marketCap' ? displayPrice * TOKEN_TOTAL_SUPPLY : displayPrice;
    const precision = chartMode === 'marketCap' ? 0 : (displayPrice < 1 ? 5 : 3);
    const minMove = chartMode === 'marketCap' ? 1 : (displayPrice < 1 ? 0.00001 : 0.001);

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: (priceChange !== null && priceChange >= 0) ? '#10b981' : '#ef4444',
      topColor: (priceChange !== null && priceChange >= 0) ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
      bottomColor: (priceChange !== null && priceChange >= 0) ? 'rgba(16, 185, 129, 0.0)' : 'rgba(239, 68, 68, 0.0)',
      lineWidth: 2,
      lineType: 0,
      priceFormat: {
        type: 'custom',
        minMove: minMove,
        formatter: (price: number) => {
          if (chartMode === 'marketCap') {
            return '$' + Math.round(price).toLocaleString('en-US');
          }
          // Prevent negative zero display
          const absolutePrice = Math.abs(price);
          return '$' + absolutePrice.toFixed(precision);
        },
      },
      autoscaleInfoProvider: (original: () => any) => {
        const res = original();
        if (res !== null && res.priceRange) {
          const { minValue, maxValue } = res.priceRange;
          // With bottom margin of 0.1 (10%), the displayed minimum is:
          // displayedMin = minValue - 0.1 * (maxValue - minValue)
          // To ensure displayedMin >= 0, we need: minValue >= maxValue / 11
          const minAllowed = maxValue / 11;

          if (minValue < minAllowed) {
            res.priceRange.minValue = minAllowed;
          }
        }
        return res;
      },
    });

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    // Handle window resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [theme, priceChange, displayPrice, chartMode]);

  // Update chart colors when price change direction changes
  useEffect(() => {
    if (!seriesRef.current) return;

    const color = (priceChange !== null && priceChange >= 0) ? '#10b981' : '#ef4444';
    const topColor = (priceChange !== null && priceChange >= 0) ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    const bottomColor = (priceChange !== null && priceChange >= 0) ? 'rgba(16, 185, 129, 0.0)' : 'rgba(239, 68, 68, 0.0)';

    seriesRef.current.applyOptions({
      lineColor: color,
      topColor: topColor,
      bottomColor: bottomColor,
    });
  }, [priceChange]);

  // Update chart data
  useEffect(() => {
    if (!seriesRef.current || !data || data.length === 0) return;

    // Sort data by time to ensure proper ordering
    const sortedData = [...data].sort((a, b) => a.time - b.time);

    const chartData: LineData[] = sortedData.map((point) => ({
      time: point.time as Time,
      value: chartMode === 'marketCap' ? point.value * TOKEN_TOTAL_SUPPLY : point.value,
    }));

    seriesRef.current.setData(chartData);

    // Fit content to show all data
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data, chartMode]);

  // Auto-refresh every 60 seconds as fallback (realtime subscription handles instant updates)
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 60000);

    return () => clearInterval(interval);
  }, [refetch]);

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl p-8 text-center">
        <p className="text-red-400">Failed to load chart: {error}</p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const isDark = theme === 'dark';

  return (
    <div className={`${isDark ? 'bg-gray-900' : 'bg-white dark:bg-gray-800'} rounded-xl ${isDark ? 'p-6' : 'p-6 shadow-lg'} space-y-4`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
              {tokenSymbol} {chartMode === 'price' ? 'Price' : 'Market Cap'}
            </h3>
            {loading && (
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
              ${formatDisplayValue(displayValue)}
            </span>
            {priceChange !== null && (
              <div className={`flex items-center gap-1 ${
                priceChange === 0
                  ? 'text-gray-500 dark:text-gray-400'
                  : priceChange > 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {priceChange >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span className="font-semibold">
                  {priceChange >= 0 ? '+' : ''}
                  {priceChange.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
          <p className={`text-xs ${isDark ? 'text-gray-500 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400'} mt-1`}>
            Updates with each new trade
          </p>
        </div>

        {/* Toggle */}
        <div className={`flex rounded-lg overflow-hidden border ${isDark ? 'border-gray-700' : 'border-gray-300 dark:border-gray-600'} w-full sm:w-auto`}>
          <button
            onClick={() => setChartMode('price')}
            className={`flex-1 sm:flex-none px-6 sm:px-4 py-3 sm:py-2 text-base sm:text-sm font-medium transition-colors ${
              chartMode === 'price'
                ? isDark
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                : isDark
                ? 'bg-gray-800 text-gray-400 hover:text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white'
            }`}
          >
            Price
          </button>
          <button
            onClick={() => setChartMode('marketCap')}
            className={`flex-1 sm:flex-none px-6 sm:px-4 py-3 sm:py-2 text-base sm:text-sm font-medium transition-colors ${
              chartMode === 'marketCap'
                ? isDark
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                : isDark
                ? 'bg-gray-800 text-gray-400 hover:text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white'
            }`}
          >
            Market Cap
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        {loading && data.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className={isDark ? 'text-gray-400' : 'text-gray-600 dark:text-gray-400'}>Loading chart data...</p>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center">
            <div className="text-center">
              <p className={`${isDark ? 'text-gray-400' : 'text-gray-600 dark:text-gray-400'} mb-2`}>No price data available yet</p>
              <p className={`text-sm ${isDark ? 'text-gray-500 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400'}`}>
                Chart appears after the first trade (1-2 minutes for snapshots)
              </p>
            </div>
          </div>
        ) : (
          <div ref={chartContainerRef} className="rounded-lg overflow-hidden w-full h-[400px]" />
        )}
      </div>

      {/* Data info */}
      {data.length > 0 && (
        <div className={`flex items-center justify-end text-sm ${isDark ? 'text-gray-400' : 'text-gray-600 dark:text-gray-400'} pt-2 border-t ${isDark ? 'border-gray-800' : 'border-gray-200 dark:border-gray-700'}`}>
          <span>Charts update with each new trade</span>
        </div>
      )}
    </div>
  );
}
