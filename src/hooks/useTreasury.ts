import { useCallback, useEffect, useState } from 'react';
import { getEthPriceUSD } from '../lib/ethPrice';
import {
  fetchMcfunCirculatingSupply,
  fetchTreasuryBalances,
  fetchTreasuryDeposits,
  TreasuryBalances,
  TreasuryDeposit,
} from '../lib/treasury';

interface TreasuryState {
  balances: TreasuryBalances | null;
  ethPriceUsd: number;
  circulatingSupply: number | null;
  ethPerMcfun: number | null;
  deposits: TreasuryDeposit[];
  loading: boolean;
  error: boolean;
  depositsError: boolean;
  lastUpdated: Date | null;
}

const initialState: TreasuryState = {
  balances: null,
  ethPriceUsd: 0,
  circulatingSupply: null,
  ethPerMcfun: null,
  deposits: [],
  loading: true,
  error: false,
  depositsError: false,
  lastUpdated: null,
};

export function useTreasury(refreshInterval = 30000) {
  const [state, setState] = useState<TreasuryState>(initialState);

  const load = useCallback(async () => {
    const [coreResult, depositsResult] = await Promise.allSettled([
      Promise.all([
        fetchTreasuryBalances(),
        getEthPriceUSD(),
        fetchMcfunCirculatingSupply(),
      ]),
      fetchTreasuryDeposits(),
    ]);

    setState((prev) => {
      const next: TreasuryState = { ...prev, loading: false, lastUpdated: new Date() };

      if (coreResult.status === 'fulfilled') {
        const [balances, ethPriceUsd, circulatingSupply] = coreResult.value;
        next.balances = balances;
        next.ethPriceUsd = ethPriceUsd;
        next.circulatingSupply = circulatingSupply;
        next.ethPerMcfun =
          circulatingSupply > 0 ? balances.total / circulatingSupply : null;
        next.error = false;
      } else {
        next.error = true;
      }

      if (depositsResult.status === 'fulfilled') {
        next.deposits = depositsResult.value;
        next.depositsError = false;
      } else {
        next.depositsError = true;
      }

      return next;
    });
  }, []);

  useEffect(() => {
    load();
    if (refreshInterval > 0) {
      const interval = setInterval(load, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [load, refreshInterval]);

  return { ...state, reload: load };
}
