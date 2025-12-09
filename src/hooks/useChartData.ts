import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface ChartDataPoint {
  time: number;
  value: number;
  priceEth?: number;
  isInterpolated?: boolean;
}

export type TimeRange = '1H' | '24H' | '7D' | '30D' | 'ALL';

const TIME_RANGE_HOURS: Record<TimeRange, number> = {
  '1H': 1,
  '24H': 24,
  '7D': 168,
  '30D': 720,
  'ALL': 8760, // 1 year, will be adjusted based on token age
};

export function useChartData(tokenAddress: string | undefined, timeRange: TimeRange = '24H') {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [currentPrice, setCurrentPrice] = useState<number>(0);

  const fetchChartData = useCallback(async () => {
    if (!tokenAddress) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
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
        setPriceChange(0);
        setLoading(false);
        return;
      }

      // Transform data for the chart
      let transformedData: ChartDataPoint[] = chartData.map((point: any) => ({
        time: Number(point.time_seconds),
        value: parseFloat(point.price_usd),
        priceEth: parseFloat(point.price_eth),
        isInterpolated: point.is_interpolated
      }));

      // Filter out data points with large time gaps for short time ranges
      // This prevents mixing old backfilled data with recent real data
      if (transformedData.length > 1 && hoursBack <= 24) {
        const expectedInterval = hoursBack === 1 ? 60 : 300; // 1 min for 1H, 5 min for 24H
        const maxGap = expectedInterval * 20; // Allow up to 20x the expected interval

        // Find the first continuous segment from the most recent data
        const continuousData: ChartDataPoint[] = [];

        // Start from the most recent point and work backwards
        for (let i = transformedData.length - 1; i >= 0; i--) {
          if (continuousData.length === 0) {
            continuousData.unshift(transformedData[i]);
          } else {
            const timeDiff = continuousData[0].time - transformedData[i].time;

            // If the gap is reasonable, include this point
            if (timeDiff <= maxGap) {
              continuousData.unshift(transformedData[i]);
            } else {
              // Large gap detected, stop here
              break;
            }
          }
        }

        // Only use the continuous segment if it has at least 2 points
        if (continuousData.length >= 2) {
          transformedData = continuousData;
        }
      }

      // Calculate price change percentage
      if (transformedData.length >= 2) {
        const firstPrice = transformedData[0].value;
        const lastPrice = transformedData[transformedData.length - 1].value;
        const change = ((lastPrice - firstPrice) / firstPrice) * 100;
        setPriceChange(change);
        setCurrentPrice(lastPrice);
      } else if (transformedData.length === 1) {
        setCurrentPrice(transformedData[0].value);
        setPriceChange(0);
      }

      setData(transformedData);
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
    refetch: fetchChartData
  };
}
