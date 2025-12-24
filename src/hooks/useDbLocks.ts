import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface DbLock {
  lock_id: number;
  user_address: string;
  token_address: string;
  amount_locked: string;
  unlock_timestamp: string;
  lock_timestamp: string;
  tx_hash: string;
  withdraw_tx_hash?: string;
  is_withdrawn: boolean;
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
          user_address,
          token_address,
          token_symbol,
          token_name,
          amount_locked,
          unlock_timestamp,
          lock_timestamp,
          tx_hash,
          withdraw_tx_hash,
          is_withdrawn
        `)
        .eq('user_address', userAddress.toLowerCase())
        .order('unlock_timestamp', { ascending: true });

      if (queryError) {
        throw queryError;
      }

      setLocks(data || []);
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
          filter: `user_address=eq.${userAddress.toLowerCase()}`,
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
