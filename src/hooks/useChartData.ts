import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface ChartDataPoint {
  time: number;
  value: number;
  priceEth?: number;
  isInterpolated?: boolean;
}

export type TimeRange = 'ALL';

const TIME_RANGE_HOURS: Record<TimeRange, number> = {
  'ALL': 8760,
};

export function useChartData(tokenAddress: string | undefined, timeRange: TimeRange = 'ALL') {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [isNew, setIsNew] = useState(false);

  const fetchChartData = useCallback(async () => {
    if (!tokenAddress) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const hoursBack = TIME_RANGE_HOURS[timeRange];

      // Single optimized query that returns all data including metadata
      const { data: chartData, error: fetchError } = await supabase
        .rpc('get_price_chart_data_optimized', {
          p_token_address: tokenAddress.toLowerCase(),
          p_hours_back: hoursBack,
          p_max_points: 500
        });

      if (fetchError) throw fetchError;

      if (!chartData || chartData.length === 0) {
        // No data available, try to get at least current price
        const { data: snapshots, error: snapError } = await supabase
          .from('price_snapshots')
          .select('created_at, price_eth, eth_price_usd, is_interpolated')
          .eq('token_address', tokenAddress.toLowerCase())
          .order('created_at', { ascending: false })
          .limit(1);

        if (snapError) throw snapError;

        if (snapshots && snapshots.length > 0) {
          const snap = snapshots[0];
          const priceUsd = parseFloat(snap.price_eth) * parseFloat(snap.eth_price_usd);
          setCurrentPrice(priceUsd);
          setData([{
            time: Math.floor(new Date(snap.created_at).getTime() / 1000),
            value: priceUsd,
            priceEth: parseFloat(snap.price_eth),
            isInterpolated: snap.is_interpolated
          }]);
        } else {
          setData([]);
        }
        setPriceChange(null);
        setIsNew(false);
        setLoading(false);
        return;
      }

      // Extract metadata from first row (all rows have same metadata)
      const firstRow = chartData[0];
      const tokenCreatedAt = firstRow.token_created_at ? new Date(firstRow.token_created_at) : null;
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const isTokenNew = tokenCreatedAt ? tokenCreatedAt > twentyFourHoursAgo : false;
      setIsNew(isTokenNew);

      // Transform data for the chart
      const transformedData: ChartDataPoint[] = chartData.map((point: any) => ({
        time: Number(point.time_seconds),
        value: parseFloat(point.price_usd),
        priceEth: parseFloat(point.price_eth),
        isInterpolated: point.is_interpolated
      }));

      setData(transformedData);

      // Use metadata from query for price calculations
      const firstPriceUsd = parseFloat(firstRow.first_price_usd);
      const lastPriceUsd = parseFloat(firstRow.last_price_usd);
      const price24hAgoUsd = parseFloat(firstRow.price_24h_ago_usd);

      setCurrentPrice(lastPriceUsd);

      // Calculate price change based on token age
      if (isTokenNew) {
        // For tokens < 24 hours old, show price change since inception
        if (firstPriceUsd > 0 && lastPriceUsd > 0) {
          const change = ((lastPriceUsd - firstPriceUsd) / firstPriceUsd) * 100;
          setPriceChange(change);
        } else {
          setPriceChange(null);
        }
      } else {
        // For tokens >= 24 hours old, calculate 24-hour price change
        if (price24hAgoUsd > 0 && lastPriceUsd > 0) {
          const change24h = ((lastPriceUsd - price24hAgoUsd) / price24hAgoUsd) * 100;
          setPriceChange(change24h);
        } else {
          setPriceChange(null);
        }
      }
    } catch (err) {
      console.error('Error fetching chart data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch chart data');
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, timeRange]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  return {
    data,
    loading,
    error,
    priceChange,
    currentPrice,
    isNew,
    refetch: fetchChartData
  };
}
