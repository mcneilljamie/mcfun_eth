import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, LineData, Time, AreaSeries } from 'lightweight-charts';
import { useChartData } from '../hooks/useChartData';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatPrice, getPriceDecimals } from '../lib/utils';

interface PriceChartProps {
  tokenAddress: string;
  tokenSymbol: string;
  theme?: 'light' | 'dark';
  livePrice?: number;
}

export function PriceChart({ tokenAddress, tokenSymbol, theme = 'dark', livePrice }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const { data, loading, error, priceChange, currentPrice, isNew, refetch } = useChartData(
    tokenAddress,
    'ALL'
  );

  const displayPrice = livePrice !== undefined ? livePrice : currentPrice;

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

    const precision = displayPrice < 1 ? 4 : 2;
    const minMove = displayPrice < 1 ? 0.0001 : 0.01;

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: (priceChange !== null && priceChange >= 0) ? '#10b981' : '#ef4444',
      topColor: (priceChange !== null && priceChange >= 0) ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
      bottomColor: (priceChange !== null && priceChange >= 0) ? 'rgba(16, 185, 129, 0.0)' : 'rgba(239, 68, 68, 0.0)',
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: precision,
        minMove: minMove,
      },
      autoscaleInfoProvider: (original) => {
        const res = original();
        if (res !== null && res.priceRange) {
          if (res.priceRange.minValue < 0) {
            res.priceRange.minValue = 0;
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
  }, [theme, priceChange, displayPrice]);

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

    const chartData: LineData[] = data.map((point) => ({
      time: point.time as Time,
      value: point.value,
    }));

    seriesRef.current.setData(chartData);

    // Fit content to show all data
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000);

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
    <div className={`${isDark ? 'bg-gray-900' : 'bg-white'} rounded-xl ${isDark ? 'p-6' : 'p-6 shadow-lg'} space-y-4`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{tokenSymbol} Price</h3>
            {loading && (
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              ${formatPrice(displayPrice)}
            </span>
            {priceChange !== null && (
              <div className={`flex items-center gap-1 ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
          {priceChange !== null && (
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
              {isNew ? 'Since Launch' : '24h'}
            </p>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        {loading && data.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>Loading chart data...</p>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center">
            <div className="text-center">
              <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} mb-2`}>No price data available yet</p>
              <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                Price history will appear after the first trade
              </p>
            </div>
          </div>
        ) : (
          <div ref={chartContainerRef} className="rounded-lg overflow-hidden w-full h-[400px]" />
        )}
      </div>

      {/* Data info */}
      {data.length > 0 && (
        <div className={`flex items-center justify-between text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} pt-2 border-t ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <span>{data.length} data points</span>
          <span>Updates every 15-30 seconds</span>
        </div>
      )}
    </div>
  );
}
