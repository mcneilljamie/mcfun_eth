import { useEffect, useState, useCallback } from 'react';
import { ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Swap {
  id: string;
  token_address: string;
  amm_address: string;
  user_address: string;
  eth_in: string;
  token_in: string;
  eth_out: string;
  token_out: string;
  tx_hash: string | null;
  created_at: string;
}

interface RecentTradesProps {
  tokenAddress: string;
  tokenSymbol: string;
  chainId: number;
}

export default function RecentTrades({ tokenAddress, tokenSymbol, chainId }: RecentTradesProps) {
  const [trades, setTrades] = useState<Swap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTrades = useCallback(async () => {
    try {
      const normalizedAddress = tokenAddress.toLowerCase();
      console.log('[RecentTrades] Loading trades for token:', normalizedAddress);

      const { data, error } = await supabase
        .from('swaps')
        .select('id, token_address, amm_address, user_address, eth_in, token_in, eth_out, token_out, tx_hash, created_at')
        .eq('token_address', normalizedAddress)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('[RecentTrades] Supabase error loading trades:', error);
        throw error;
      }

      console.log(`[RecentTrades] Loaded ${data?.length || 0} trades for token ${normalizedAddress}`, data);
      setTrades(data || []);
    } catch (err) {
      console.error('[RecentTrades] Failed to load trades:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tokenAddress]);

  useEffect(() => {
    console.log('[RecentTrades] Component mounted/updated with tokenAddress:', tokenAddress);
    setIsLoading(true);
    loadTrades();

    const normalizedAddress = tokenAddress.toLowerCase();

    // Subscribe to real-time updates for new swaps
    const channel = supabase
      .channel(`swaps:${normalizedAddress}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'swaps',
          filter: `token_address=eq.${normalizedAddress}`
        },
        (payload) => {
          console.log('[RecentTrades] New swap received via realtime:', payload);
          // Add new swap to the beginning of the list
          setTrades((prev) => {
            const newSwap = payload.new as Swap;
            // Keep only the 10 most recent trades
            return [newSwap, ...prev].slice(0, 10);
          });
        }
      )
      .subscribe((status) => {
        console.log('[RecentTrades] Realtime subscription status:', status);
      });

    // Also poll every second as a fallback
    const interval = setInterval(loadTrades, 1000);

    return () => {
      console.log('[RecentTrades] Cleaning up subscriptions for:', normalizedAddress);
      channel.unsubscribe();
      clearInterval(interval);
    };
  }, [loadTrades, tokenAddress]);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    if (num === 0) return '0';
    if (num < 0.0001) return num.toExponential(2);
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const getExplorerUrl = (txHash: string) => {
    if (chainId === 1) {
      return `https://etherscan.io/tx/${txHash}`;
    } else if (chainId === 11155111) {
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    }
    return `https://etherscan.io/tx/${txHash}`;
  };

  const getTimeAgo = (timestamp: string) => {
    const now = Date.now();
    const created = new Date(timestamp).getTime();
    const diffMs = now - created;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-xl font-semibold mb-4">Recent Trades</h2>
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-xl font-semibold mb-4">Recent Trades</h2>
        <p className="text-gray-500 text-center py-8">No trades yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-semibold mb-4">Recent Trades</h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-gray-500 border-b">
              <th className="pb-3 font-medium">Type</th>
              <th className="pb-3 font-medium">Amount</th>
              <th className="pb-3 font-medium">Total ETH</th>
              <th className="pb-3 font-medium">Trader</th>
              <th className="pb-3 font-medium">Time</th>
              <th className="pb-3 font-medium">Tx</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {trades.map((trade) => {
              const ethIn = parseFloat(trade.eth_in || '0');
              const ethOut = parseFloat(trade.eth_out || '0');
              const tokenIn = parseFloat(trade.token_in || '0');
              const tokenOut = parseFloat(trade.token_out || '0');

              const isBuy = ethIn > 0;
              const ethAmount = isBuy ? ethIn.toString() : ethOut.toString();
              const tokenAmount = isBuy ? tokenOut.toString() : tokenIn.toString();

              return (
                <tr key={trade.id} className="text-sm hover:bg-gray-50">
                  <td className="py-3">
                    <div className={`flex items-center space-x-1 ${isBuy ? 'text-green-600' : 'text-red-600'}`}>
                      {isBuy ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4" />
                      )}
                      <span className="font-medium">{isBuy ? 'Buy' : 'Sell'}</span>
                    </div>
                  </td>
                  <td className="py-3">
                    <div>
                      <div className="font-medium">{formatAmount(tokenAmount)}</div>
                      <div className="text-xs text-gray-500">{tokenSymbol}</div>
                    </div>
                  </td>
                  <td className="py-3 font-medium">
                    {formatAmount(ethAmount)} ETH
                  </td>
                  <td className="py-3">
                    <a
                      href={getExplorerUrl(trade.user_address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700 font-mono"
                    >
                      {formatAddress(trade.user_address)}
                    </a>
                  </td>
                  <td className="py-3 text-gray-500">
                    {getTimeAgo(trade.created_at)}
                  </td>
                  <td className="py-3">
                    {trade.tx_hash ? (
                      <a
                        href={getExplorerUrl(trade.tx_hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
