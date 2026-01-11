import { useState, useEffect } from 'react';
import { getAMMReserves } from '../lib/contracts';
import { getReadOnlyProvider } from '../lib/utils';

export function useLiveReserves(
  provider: any,
  ammAddress: string | null,
  refreshInterval: number = 10000,
  chainId: number = 11155111
) {
  const [reserves, setReserves] = useState<{ reserveETH: string; reserveToken: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReserves = async () => {
    if (!ammAddress) {
      setReserves(null);
      setLoading(false);
      return;
    }

    try {
      const effectiveProvider = provider || getReadOnlyProvider(chainId);
      const reserveData = await getAMMReserves(effectiveProvider, ammAddress);
      setReserves({
        reserveETH: reserveData.reserveETH,
        reserveToken: reserveData.reserveToken,
      });
    } catch (err) {
      console.error('Failed to load reserves:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReserves();

    if (refreshInterval > 0) {
      const interval = setInterval(loadReserves, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [provider, ammAddress, refreshInterval, chainId]);

  return { reserves, loading, reload: loadReserves };
}
