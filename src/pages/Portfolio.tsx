import { useEffect, useState } from 'react';
import { useWeb3 } from '../lib/web3';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';
import { getEthPriceUSD } from '../lib/ethPrice';
import { Loader2, Wallet, Lock as LockIcon, Clock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_CHAIN_IDS, getRpcUrl } from '../contracts/addresses';

interface TokenBalance {
  tokenAddress: string;
  symbol: string;
  name: string;
  balance: string;
  priceEth: number;
  priceUsd: number;
  valueEth: number;
  valueUsd: number;
  change24h: number;
  chainId: number;
}

interface LockedToken {
  id: string;
  lock_id: number;
  token_address: string;
  token_symbol: string;
  token_name: string;
  token_decimals: number;
  amount_locked: string;
  amount_locked_formatted: number;
  lock_duration_days: number;
  lock_timestamp: string;
  unlock_timestamp: string;
  is_withdrawn: boolean;
  is_unlockable: boolean;
  current_price_eth: number;
  current_price_usd: number;
  value_eth: number;
  value_usd: number;
  tx_hash: string;
  chain_id: number;
}

interface AggregatedLockedToken {
  token_address: string;
  token_symbol: string;
  token_name: string;
  total_amount_locked: number;
  lock_count: number;
  total_value_usd: number;
  current_price_usd: number;
  earliest_unlock: string;
  has_unlockable: boolean;
  chain_id: number;
}

export default function Portfolio() {
  const { t } = useTranslation();
  const { account, provider } = useWeb3();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [lockedTokens, setLockedTokens] = useState<LockedToken[]>([]);
  const [aggregatedLockedTokens, setAggregatedLockedTokens] = useState<AggregatedLockedToken[]>([]);
  const [ethBalance, setEthBalance] = useState('0');
  const [ethPriceUsd, setEthPriceUsd] = useState(0);
  const [totalValueUsd, setTotalValueUsd] = useState(0);
  const [totalLockedValueUsd, setTotalLockedValueUsd] = useState(0);

  useEffect(() => {
    if (account) {
      loadPortfolio();
    } else {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (!account) return;

    const channel = supabase
      .channel('portfolio-lock-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'token_locks',
          filter: `user_address=eq.${account.toLowerCase()}`,
        },
        (payload) => {
          console.log('Lock updated, reloading portfolio:', payload);
          if (payload.new.is_withdrawn) {
            loadPortfolio();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [account]);

  const loadPortfolio = async () => {
    if (!account) return;

    console.log('=== PORTFOLIO LOAD DEBUG ===');
    console.log('Account:', account);

    try {
      setLoading(true);

      // Get ETH price
      console.log('Fetching ETH price...');
      const ethPrice = await getEthPriceUSD();
      console.log('ETH price USD:', ethPrice);
      setEthPriceUsd(ethPrice);

      function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
      }

      // Create providers for all supported chains
      const providers = new Map<number, ethers.JsonRpcProvider>();
      for (const chainId of SUPPORTED_CHAIN_IDS) {
        const rpcUrl = getRpcUrl(chainId);
        providers.set(chainId, new ethers.JsonRpcProvider(rpcUrl));
      }

      // Get ETH balance from all chains in parallel
      console.log('Fetching ETH balance for account from all chains:', account);
      const ethBalanceResults = await Promise.allSettled(
        Array.from(providers.entries()).map(async ([chainId, chainProvider]) => {
          const balance = await withTimeout(chainProvider.getBalance(account), 10000);
          const ethBal = parseFloat(ethers.formatEther(balance));
          console.log(`Chain ${chainId} ETH balance:`, ethBal);
          return ethBal;
        })
      );
      const totalEthBalance = ethBalanceResults.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
      console.log('Total ETH balance across all chains:', totalEthBalance);
      setEthBalance(totalEthBalance.toString());

      // Get all tokens from the platform
      console.log('Fetching all tokens from database...');
      const { data: allTokens } = await supabase
        .from('tokens')
        .select('token_address, symbol, name, current_eth_reserve, current_token_reserve, price_change_24h, created_at, chain_id');

      console.log('Found tokens:', allTokens?.length || 0);

      if (!allTokens || allTokens.length === 0) {
        console.log('No tokens found in database');
        setLoading(false);
        return;
      }

      // Use cached 24h price changes from tokens table
      const priceChangeMap = new Map<string, number>();
      allTokens.forEach(token => {
        if (token.price_change_24h) {
          priceChangeMap.set(`${token.token_address}_${token.chain_id}`, parseFloat(token.price_change_24h));
        }
      });

      // Check balances for all tokens in parallel
      const ERC20_ABI = [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ];

      console.log(`Checking balances for ${allTokens.length} tokens across all chains...`);

      const balanceResults = await Promise.allSettled(
        allTokens.map(async (token) => {
          const chainId = token.chain_id || 1;
          const chainProvider = providers.get(chainId);
          if (!chainProvider) return null;

          const contract = new ethers.Contract(token.token_address, ERC20_ABI, chainProvider);
          const [balance, decimals] = await withTimeout(
            Promise.all([contract.balanceOf(account), contract.decimals()]),
            12000
          );

          const balanceFormatted = ethers.formatUnits(balance, decimals);
          if (parseFloat(balanceFormatted) <= 0) return null;

          const ethReserve = parseFloat(token.current_eth_reserve);
          const tokenReserve = parseFloat(token.current_token_reserve);
          const priceEth = tokenReserve > 0 ? ethReserve / tokenReserve : 0;
          const priceUsd = priceEth * ethPrice;
          const valueEth = parseFloat(balanceFormatted) * priceEth;
          const valueUsd = valueEth * ethPrice;
          const change24h = priceChangeMap.get(`${token.token_address}_${chainId}`) || 0;

          return {
            tokenAddress: token.token_address,
            symbol: token.symbol,
            name: token.name,
            balance: balanceFormatted,
            priceEth,
            priceUsd,
            valueEth,
            valueUsd,
            change24h,
            chainId,
          } as TokenBalance;
        })
      );

      const tokenBalances: TokenBalance[] = balanceResults
        .filter((r): r is PromiseFulfilledResult<TokenBalance | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((v): v is TokenBalance => v !== null);

      console.log(`Found ${tokenBalances.length} tokens with balance > 0`);

      // Sort by value USD descending
      tokenBalances.sort((a, b) => b.valueUsd - a.valueUsd);
      setTokens(tokenBalances);

      // Load locked tokens from database (indexed from blockchain)
      let lockedValue = 0;
      let aggregatedTokens: any[] = [];

      try {
        // Get lock data for this user
        const { data: locksData } = await supabase.rpc('get_user_locked_tokens', {
          user_addr: account
        });

        if (locksData && locksData.length > 0) {
          // Group locks by token address AND chain ID
          const tokenGroups = new Map<string, any[]>();
          for (const lockData of locksData) {
            // Create a composite key: address + chain ID
            const groupKey = `${lockData.token_address.toLowerCase()}_${lockData.chain_id}`;
            if (!tokenGroups.has(groupKey)) {
              tokenGroups.set(groupKey, []);
            }
            tokenGroups.get(groupKey)!.push(lockData);
          }

          // Process each token's aggregated locks
          for (const [groupKey, locks] of tokenGroups) {
            const tokenAddr = locks[0].token_address.toLowerCase();
            const chainId = locks[0].chain_id;
            try {
              // Use price and value data already calculated by the database function
              const priceUsd = locks[0].current_price_usd || 0;

              console.log(`Token: ${locks[0].token_symbol} (Chain ${chainId}), Price USD: $${priceUsd}`);

              // Aggregate all locks for this token
              let totalAmountLocked = 0;
              let totalValueUsd = 0;
              let earliestUnlock = locks[0].unlock_timestamp;
              let hasUnlockable = false;

              for (const lock of locks) {
                // Use the formatted amount already calculated by the database
                totalAmountLocked += parseFloat(lock.amount_locked_formatted || 0);

                // Use the value already calculated by the database
                totalValueUsd += parseFloat(lock.value_usd || 0);

                // Find earliest unlock
                if (new Date(lock.unlock_timestamp) < new Date(earliestUnlock)) {
                  earliestUnlock = lock.unlock_timestamp;
                }

                // Check if any lock is unlockable (time has passed and not withdrawn)
                const unlockTime = Math.floor(new Date(lock.unlock_timestamp).getTime() / 1000);
                const now = Math.floor(Date.now() / 1000);
                if (now >= unlockTime && !lock.is_withdrawn) {
                  hasUnlockable = true;
                }
              }

              aggregatedTokens.push({
                id: `${tokenAddr}_${chainId}`,
                lock_id: locks[0].lock_id,
                token_address: tokenAddr,
                token_symbol: locks[0].token_symbol,
                token_name: locks[0].token_name,
                token_decimals: locks[0].token_decimals,
                amount_locked_formatted: totalAmountLocked,
                lock_count: locks.length,
                unlock_timestamp: earliestUnlock,
                is_unlockable: hasUnlockable,
                current_price_usd: priceUsd,
                value_usd: totalValueUsd,
                chain_id: chainId,
              });

              lockedValue += totalValueUsd;
            } catch (err) {
              console.error(`Failed to load lock info for ${tokenAddr}:`, err);
            }
          }

          setLockedTokens(aggregatedTokens);
        }
      } catch (err) {
        console.error('Failed to load locks from database:', err);
      }

      console.log('Total locked value:', lockedValue);
      setTotalLockedValueUsd(lockedValue);

      // Format aggregated tokens for display
      const aggregatedArray = aggregatedTokens.map(lock => ({
        token_address: lock.token_address,
        token_symbol: lock.token_symbol,
        token_name: lock.token_name,
        total_amount_locked: lock.amount_locked_formatted,
        lock_count: lock.lock_count,
        total_value_usd: lock.value_usd,
        current_price_usd: lock.current_price_usd,
        earliest_unlock: lock.unlock_timestamp,
        has_unlockable: lock.is_unlockable,
        chain_id: lock.chain_id,
      }));
      // Sort by total value descending
      aggregatedArray.sort((a, b) => b.total_value_usd - a.total_value_usd);
      setAggregatedLockedTokens(aggregatedArray);

      // Calculate total value (including locked tokens)
      const ethValue = totalEthBalance * ethPrice;
      const tokensValue = tokenBalances.reduce((sum, t) => sum + t.valueUsd, 0);
      const totalValue = ethValue + tokensValue + lockedValue;
      console.log('ETH value:', ethValue);
      console.log('Tokens value:', tokensValue);
      console.log('Locked value:', lockedValue);
      console.log('Total portfolio value:', totalValue);
      setTotalValueUsd(totalValue);

      setLoading(false);
      console.log('=== PORTFOLIO LOAD COMPLETE ===');
    } catch (err) {
      console.error('Error loading portfolio:', err);
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}K`;
    } else {
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  const formatPrice = (value: number) => {
    if (value >= 1) {
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
    } else if (value >= 0.0001) {
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`;
    } else {
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })}`;
    }
  };

  const formatNumber = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num >= 1000000) {
      return `${(num / 1000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}K`;
    } else if (num >= 1) {
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
      return num.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
    }
  };

  if (!account) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <Wallet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('portfolio.connectWallet')}</h2>
          <p className="text-gray-600 dark:text-gray-400">
            {t('portfolio.connectWalletDescription')}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-green-700" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">{t('portfolio.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Portfolio Summary */}
      <div className="bg-gradient-to-r from-green-700 to-green-800 rounded-2xl p-8 mb-8 text-white">
        <h1 className="text-3xl font-bold mb-2">{t('portfolio.portfolioValue')}</h1>
        <div className="text-5xl font-bold mb-6">{formatCurrency(totalValueUsd)}</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          <div className="bg-white/20 backdrop-blur rounded-lg p-4">
            <div className="text-green-100 text-sm mb-2">{t('portfolio.ethBalance')}</div>
            <div className="text-2xl font-bold text-white mb-1">
              {parseFloat(ethBalance).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ETH
            </div>
            <div className="text-green-100 text-sm">
              {formatCurrency(parseFloat(ethBalance) * ethPriceUsd)}
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur rounded-lg p-4">
            <div className="text-green-100 text-sm mb-2">{t('portfolio.tokensValue')}</div>
            <div className="text-2xl font-bold text-white">
              {formatCurrency(tokens.reduce((sum, t) => sum + t.valueUsd, 0))}
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur rounded-lg p-4">
            <div className="text-green-100 text-sm mb-2 flex items-center">
              <LockIcon className="w-4 h-4 mr-1" />
              {t('portfolio.lockedValue')}
            </div>
            <div className="text-2xl font-bold text-white">
              {formatCurrency(totalLockedValueUsd)}
            </div>
          </div>
        </div>
      </div>

      {/* Info Message */}
      <div className="bg-green-50 dark:bg-green-900/30 border border-green-300 dark:border-green-700/50 rounded-lg p-4 mb-6">
        <p className="text-sm text-green-900 dark:text-green-100">
          {t('portfolio.infoMessage')}
        </p>
      </div>

      {/* Token Holdings */}
      {tokens.length === 0 && aggregatedLockedTokens.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-12 text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-6">{t('portfolio.noHoldings')}</p>
          <Link
            to="/tokens"
            className="inline-block px-8 py-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition-colors shadow-md"
          >
            {t('portfolio.browseTokens')}
          </Link>
        </div>
      ) : tokens.length > 0 ? (
        <div className="space-y-3 mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('portfolio.yourHoldings')}</h2>
          {tokens.map((token) => (
            <div
              key={`${token.tokenAddress}_${token.chainId}`}
              onClick={() => navigate(`/token/${token.tokenAddress}`)}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg hover:border-green-400 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap">{token.symbol}</h3>
<span className="text-sm text-gray-500 dark:text-gray-400 break-words">{token.name}</span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {t('portfolio.balance')}: {formatNumber(token.balance)} {token.symbol}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                    {formatCurrency(token.valueUsd)}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {formatPrice(token.priceUsd)} {t('portfolio.perToken')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Locked Tokens Section */}
      {aggregatedLockedTokens.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
              <LockIcon className="w-5 h-5 mr-2 text-green-700" />
              {t('portfolio.lockedTokens')}
            </h2>
            <Link
              to="/my-locks"
              className="text-green-700 hover:text-green-800 text-sm font-medium"
            >
              {t('portfolio.viewAllLocks')} →
            </Link>
          </div>
          <div className="space-y-3">
            {aggregatedLockedTokens.map((aggLock) => {
              const now = new Date();
              const unlockDate = new Date(aggLock.earliest_unlock);
              const timeRemaining = unlockDate.getTime() - now.getTime();
              const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

              return (
                <div
                  key={aggLock.token_address}
                  onClick={() => navigate(`/lock/${aggLock.token_address}`)}
                  className="rounded-xl border-2 p-6 hover:shadow-lg transition-all cursor-pointer bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-green-400 dark:hover:border-green-600"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <LockIcon className="w-5 h-5 text-green-700 dark:text-green-500" />
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{aggLock.token_symbol}</h3>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{aggLock.token_name}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div className="text-gray-600 dark:text-gray-400">
                          {t('portfolio.locked')}: <span className="font-semibold text-gray-900 dark:text-white">{formatNumber(aggLock.total_amount_locked)} {aggLock.token_symbol}</span>
                        </div>
                        <div className="text-gray-600 dark:text-gray-400 flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {aggLock.lock_count} {aggLock.lock_count === 1 ? 'lock' : 'locks'}
                        </div>
                        <div className="text-gray-600 dark:text-gray-400">
                          {t('portfolio.unlocks')}: <span className="font-semibold text-gray-900 dark:text-white">{new Date(aggLock.earliest_unlock).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                        {formatCurrency(aggLock.total_value_usd)}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {formatPrice(aggLock.current_price_usd)} {t('portfolio.perToken')}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
