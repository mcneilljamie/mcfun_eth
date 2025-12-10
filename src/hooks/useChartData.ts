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
      // First, get token creation date to determine if it's < 24 hours old
      const { data: tokenData, error: tokenError } = await supabase
        .from('tokens')
        .select('created_at')
        .eq('token_address', tokenAddress.toLowerCase())
        .maybeSingle();

      if (tokenError) throw tokenError;

      const tokenCreatedAt = tokenData?.created_at ? new Date(tokenData.created_at) : null;
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const isTokenNew = tokenCreatedAt ? tokenCreatedAt > twentyFourHoursAgo : false;
      setIsNew(isTokenNew);

      const hoursBack = TIME_RANGE_HOURS[timeRange];

      // Call the database function to get optimized chart data
      const { data: chartData, error: fetchError } = await supabase
        .rpc('get_price_chart_data', {
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
        setLoading(false);
        return;
      }

      // Transform data for the chart
      const transformedData: ChartDataPoint[] = chartData.map((point: any) => ({
        time: Number(point.time_seconds),
        value: parseFloat(point.price_usd),
        priceEth: parseFloat(point.price_eth),
        isInterpolated: point.is_interpolated
      }));

      setData(transformedData);

      // Calculate price change based on token age
      if (isTokenNew) {
        // For tokens < 24 hours old, show price change since inception
        if (transformedData.length >= 2) {
          const firstPrice = transformedData[0].value;
          const lastPrice = transformedData[transformedData.length - 1].value;
          const change = ((lastPrice - firstPrice) / firstPrice) * 100;
          setPriceChange(change);
          setCurrentPrice(lastPrice);
        } else if (transformedData.length === 1) {
          setCurrentPrice(transformedData[0].value);
          setPriceChange(null); // Not enough data to show change
        }
      } else {
        // For tokens >= 24 hours old, calculate 24-hour price change
        const { data: priceData24h, error: price24hError } = await supabase
          .from('price_snapshots')
          .select('created_at, price_eth, eth_price_usd')
          .eq('token_address', tokenAddress.toLowerCase())
          .gte('created_at', twentyFourHoursAgo.toISOString())
          .order('created_at', { ascending: true });

        if (price24hError) throw price24hError;

        if (priceData24h && priceData24h.length >= 2) {
          const firstPrice24h = parseFloat(priceData24h[0].price_eth) * parseFloat(priceData24h[0].eth_price_usd);
          const lastPrice24h = parseFloat(priceData24h[priceData24h.length - 1].price_eth) * parseFloat(priceData24h[priceData24h.length - 1].eth_price_usd);
          const change24h = ((lastPrice24h - firstPrice24h) / firstPrice24h) * 100;
          setPriceChange(change24h);
          setCurrentPrice(lastPrice24h);
        } else {
          // Not enough data in the last 24 hours
          if (transformedData.length > 0) {
            setCurrentPrice(transformedData[transformedData.length - 1].value);
          }
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
