import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface DbLock {
  lock_id: number;
  owner_address: string;
  token_address: string;
  amount: string;
  unlock_time: number;
  lock_timestamp: string;
  tx_hash: string;
  withdraw_tx_hash?: string;
  withdrawn: boolean;
  token_symbol?: string;
  token_name?: string;
}

export function useDbLocks(userAddress: string | null) {
  const [locks, setLocks] = useState<DbLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLocks = async () => {
    if (!userAddress) {
      setLocks([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('token_locks')
        .select(`
          lock_id,
          owner_address,
          token_address,
          amount,
          unlock_time,
          lock_timestamp,
          tx_hash,
          withdraw_tx_hash,
          withdrawn
        `)
        .eq('owner_address', userAddress.toLowerCase())
        .order('unlock_time', { ascending: true });

      if (queryError) {
        throw queryError;
      }

      if (!data || data.length === 0) {
        setLocks([]);
        setLoading(false);
        return;
      }

      // Get unique token addresses
      const tokenAddresses = [...new Set(data.map(lock => lock.token_address))];

      // Fetch token metadata from tokens table
      const { data: tokensData } = await supabase
        .from('tokens')
        .select('token_address, symbol, name')
        .in('token_address', tokenAddresses);

      const tokenMetadata = new Map(
        tokensData?.map(t => [t.token_address.toLowerCase(), { symbol: t.symbol, name: t.name }]) || []
      );

      // Enrich locks with token metadata
      const enrichedLocks = data.map(lock => ({
        ...lock,
        token_symbol: tokenMetadata.get(lock.token_address.toLowerCase())?.symbol,
        token_name: tokenMetadata.get(lock.token_address.toLowerCase())?.name,
      }));

      setLocks(enrichedLocks);
    } catch (err: any) {
      console.error('Failed to load locks from database:', err);
      setError(err.message || 'Failed to load locks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocks();
  }, [userAddress]);

  // Subscribe to real-time updates for this user's locks
  useEffect(() => {
    if (!userAddress) return;

    const channel = supabase
      .channel('user-locks')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'token_locks',
          filter: `owner_address=eq.${userAddress.toLowerCase()}`,
        },
        () => {
          loadLocks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userAddress]);

  return { locks, loading, error, reload: loadLocks };
}
