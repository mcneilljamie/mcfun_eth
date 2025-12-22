import { useEffect, useState } from 'react';
import { useWeb3 } from '../lib/web3';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';
import { getEthPriceUSD } from '../lib/ethPrice';
import { Loader2, Wallet, Lock as LockIcon, Clock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

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
    if (account && provider) {
      loadPortfolio();
    } else {
      setLoading(false);
    }
  }, [account, provider]);

  const loadPortfolio = async () => {
    if (!account || !provider) return;

    console.log('=== PORTFOLIO LOAD DEBUG ===');
    console.log('Account:', account);
    console.log('Provider:', provider);

    try {
      setLoading(true);

      // Get ETH price
      console.log('Fetching ETH price...');
      const ethPrice = await getEthPriceUSD();
      console.log('ETH price USD:', ethPrice);
      setEthPriceUsd(ethPrice);

      // Get ETH balance
      console.log('Fetching ETH balance for account:', account);
      const balance = await provider.getBalance(account);
      console.log('Raw ETH balance (wei):', balance.toString());
      const ethBal = ethers.formatEther(balance);
      console.log('Formatted ETH balance:', ethBal);
      setEthBalance(ethBal);

      // Get all tokens from the platform
      console.log('Fetching all tokens from database...');
      const { data: allTokens } = await supabase
        .from('tokens')
        .select('token_address, symbol, name, current_eth_reserve, current_token_reserve');

      console.log('Found tokens:', allTokens?.length || 0);

      if (!allTokens || allTokens.length === 0) {
        console.log('No tokens found in database');
        setLoading(false);
        return;
      }

      // Get 24h price changes
      const { data: priceChanges } = await supabase.rpc('get_24h_price_changes');

      const priceChangeMap = new Map(
        priceChanges?.map((pc: any) => [pc.token_address, pc.price_change_24h]) || []
      );

      // Check balances for each token
      const tokenBalances: TokenBalance[] = [];
      const ERC20_ABI = [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ];

      console.log(`Checking balances for ${allTokens.length} tokens...`);

      for (const token of allTokens) {
        try {
          console.log(`Checking ${token.symbol} (${token.token_address})...`);
          const contract = new ethers.Contract(token.token_address, ERC20_ABI, provider);
          const [balance, decimals] = await Promise.all([
            contract.balanceOf(account),
            contract.decimals(),
          ]);

          console.log(`  Raw balance: ${balance.toString()}`);
          console.log(`  Decimals: ${decimals}`);

          const balanceFormatted = ethers.formatUnits(balance, decimals);
          console.log(`  Formatted balance: ${balanceFormatted}`);

          if (parseFloat(balanceFormatted) > 0) {
            console.log(`  ✓ User has ${balanceFormatted} ${token.symbol}`);
            const ethReserve = parseFloat(token.current_eth_reserve);
            const tokenReserve = parseFloat(token.current_token_reserve);
            const priceEth = ethReserve / tokenReserve;
            const priceUsd = priceEth * ethPrice;
            const valueEth = parseFloat(balanceFormatted) * priceEth;
            const valueUsd = valueEth * ethPrice;
            const change24h = priceChangeMap.get(token.token_address) || 0;

            tokenBalances.push({
              tokenAddress: token.token_address,
              symbol: token.symbol,
              name: token.name,
              balance: balanceFormatted,
              priceEth,
              priceUsd,
              valueEth,
              valueUsd,
              change24h,
            });
          } else {
            console.log(`  ✗ User has 0 ${token.symbol}`);
          }
        } catch (err) {
          console.error(`Error loading balance for ${token.symbol}:`, err);
        }
      }

      console.log(`Found ${tokenBalances.length} tokens with balance > 0`);

      // Sort by value USD descending
      tokenBalances.sort((a, b) => b.valueUsd - a.valueUsd);
      setTokens(tokenBalances);

      // Load locked tokens
      const { data: lockedData, error: lockedError } = await supabase
        .rpc('get_user_locked_tokens', { user_addr: account });

      let lockedValue = 0;
      if (!lockedError && lockedData) {
        console.log('Locked tokens data:', lockedData);
        setLockedTokens(lockedData);
        // Only count non-withdrawn locks in the total locked value
        // Withdrawn locks are already counted in the wallet balance
        lockedValue = lockedData.reduce((sum: number, lock: any) => {
          if (lock.is_withdrawn) {
            console.log(`Lock ${lock.token_symbol}: withdrawn, skipping from total`);
            return sum;
          }
          const lockValue = Number(lock.value_usd) || 0;
          console.log(`Lock ${lock.token_symbol}: value_usd = ${lock.value_usd}, parsed = ${lockValue}`);
          return sum + lockValue;
        }, 0);
        console.log('Total locked value:', lockedValue);
        setTotalLockedValueUsd(lockedValue);

        // Aggregate locked tokens by token address (excluding withdrawn locks)
        const aggregated = new Map<string, AggregatedLockedToken>();
        for (const lock of lockedData) {
          // Skip withdrawn locks in aggregation
          if (lock.is_withdrawn) {
            continue;
          }
          const key = lock.token_address.toLowerCase();
          const existing = aggregated.get(key);
          const unlockDate = new Date(lock.unlock_timestamp);

          if (existing) {
            existing.total_amount_locked += lock.amount_locked_formatted;
            existing.lock_count += 1;
            existing.total_value_usd += Number(lock.value_usd) || 0;
            existing.has_unlockable = existing.has_unlockable || lock.is_unlockable;
            // Keep earliest unlock date
            if (unlockDate < new Date(existing.earliest_unlock)) {
              existing.earliest_unlock = lock.unlock_timestamp;
            }
          } else {
            aggregated.set(key, {
              token_address: lock.token_address,
              token_symbol: lock.token_symbol,
              token_name: lock.token_name,
              total_amount_locked: lock.amount_locked_formatted,
              lock_count: 1,
              total_value_usd: Number(lock.value_usd) || 0,
              current_price_usd: lock.current_price_usd,
              earliest_unlock: lock.unlock_timestamp,
              has_unlockable: lock.is_unlockable,
            });
          }
        }

        const aggregatedArray = Array.from(aggregated.values());
        // Sort by total value descending
        aggregatedArray.sort((a, b) => b.total_value_usd - a.total_value_usd);
        setAggregatedLockedTokens(aggregatedArray);
      }

      // Calculate total value (including locked tokens)
      const ethValue = parseFloat(ethBal) * ethPrice;
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
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('portfolio.connectWallet')}</h2>
          <p className="text-gray-600">
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
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-600">{t('portfolio.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Portfolio Summary */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 mb-8 text-white">
        <h1 className="text-3xl font-bold mb-2">{t('portfolio.portfolioValue')}</h1>
        <div className="text-5xl font-bold mb-6">{formatCurrency(totalValueUsd)}</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          <div className="bg-white/10 backdrop-blur rounded-lg p-4">
            <div className="text-blue-100 text-sm mb-2">{t('portfolio.ethBalance')}</div>
            <div className="text-2xl font-bold mb-1">
              {parseFloat(ethBalance).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ETH
            </div>
            <div className="text-blue-100 text-sm">
              {formatCurrency(parseFloat(ethBalance) * ethPriceUsd)}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-lg p-4">
            <div className="text-blue-100 text-sm mb-2">{t('portfolio.tokensValue')}</div>
            <div className="text-2xl font-bold">
              {formatCurrency(tokens.reduce((sum, t) => sum + t.valueUsd, 0))}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-lg p-4">
            <div className="text-blue-100 text-sm mb-2 flex items-center">
              <LockIcon className="w-4 h-4 mr-1" />
              {t('portfolio.lockedValue')}
            </div>
            <div className="text-2xl font-bold">
              {formatCurrency(totalLockedValueUsd)}
            </div>
          </div>
        </div>
      </div>

      {/* Info Message */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800">
          {t('portfolio.infoMessage')}
        </p>
      </div>

      {/* Token Holdings */}
      {tokens.length === 0 && aggregatedLockedTokens.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <p className="text-gray-600 text-lg mb-6">{t('portfolio.noHoldings')}</p>
          <Link
            to="/tokens"
            className="inline-block px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md"
          >
            {t('portfolio.browseTokens')}
          </Link>
        </div>
      ) : tokens.length > 0 ? (
        <div className="space-y-3 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{t('portfolio.yourHoldings')}</h2>
          {tokens.map((token) => (
            <div
              key={token.tokenAddress}
              onClick={() => navigate(`/token/${token.tokenAddress}`)}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{token.symbol}</h3>
                    <span className="text-sm text-gray-500">{token.name}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {t('portfolio.balance')}: {formatNumber(token.balance)} {token.symbol}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {formatCurrency(token.valueUsd)}
                  </div>
                  <div className="text-sm text-gray-500">
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
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <LockIcon className="w-5 h-5 mr-2 text-blue-600" />
              {t('portfolio.lockedTokens')}
            </h2>
            <Link
              to="/my-locks"
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
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
                  className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-purple-200 p-6 hover:shadow-lg transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <LockIcon className="w-5 h-5 text-purple-600" />
                        <h3 className="text-xl font-bold text-gray-900">{aggLock.token_symbol}</h3>
                        <span className="text-sm text-gray-500">{aggLock.token_name}</span>
                        {aggLock.has_unlockable && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            {t('portfolio.unlockable')}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div className="text-gray-600">
                          {t('portfolio.locked')}: <span className="font-semibold text-gray-900">{formatNumber(aggLock.total_amount_locked)} {aggLock.token_symbol}</span>
                        </div>
                        <div className="text-gray-600 flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {aggLock.lock_count} {aggLock.lock_count === 1 ? 'lock' : 'locks'}
                        </div>
                        <div className="text-gray-600">
                          {t('portfolio.unlocks')}: <span className="font-semibold text-gray-900">{new Date(aggLock.earliest_unlock).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-2xl font-bold text-gray-900 mb-1">
                        {formatCurrency(aggLock.total_value_usd)}
                      </div>
                      <div className="text-sm text-gray-500">
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
