import { useEffect, useState } from 'react';
import { useWeb3 } from '../lib/web3';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';
import { getEthPriceUSD } from '../lib/ethPrice';
import { Loader2, Wallet } from 'lucide-react';
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

export default function Portfolio() {
  const { t } = useTranslation();
  const { account, provider } = useWeb3();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [ethBalance, setEthBalance] = useState('0');
  const [ethPriceUsd, setEthPriceUsd] = useState(0);
  const [totalValueUsd, setTotalValueUsd] = useState(0);

  useEffect(() => {
    if (account && provider) {
      loadPortfolio();
    } else {
      setLoading(false);
    }
  }, [account, provider]);

  const loadPortfolio = async () => {
    if (!account || !provider) return;

    try {
      setLoading(true);

      // Get ETH price
      const ethPrice = await getEthPriceUSD();
      setEthPriceUsd(ethPrice);

      // Get ETH balance
      const balance = await provider.getBalance(account);
      const ethBal = ethers.formatEther(balance);
      setEthBalance(ethBal);

      // Get all tokens from the platform
      const { data: allTokens } = await supabase
        .from('tokens')
        .select('token_address, symbol, name, current_eth_reserve, current_token_reserve');

      if (!allTokens || allTokens.length === 0) {
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

      for (const token of allTokens) {
        try {
          const contract = new ethers.Contract(token.token_address, ERC20_ABI, provider);
          const [balance, decimals] = await Promise.all([
            contract.balanceOf(account),
            contract.decimals(),
          ]);

          const balanceFormatted = ethers.formatUnits(balance, decimals);

          if (parseFloat(balanceFormatted) > 0) {
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
          }
        } catch (err) {
          console.error(`Error loading balance for ${token.symbol}:`, err);
        }
      }

      // Sort by value USD descending
      tokenBalances.sort((a, b) => b.valueUsd - a.valueUsd);
      setTokens(tokenBalances);

      // Calculate total value
      const ethValue = parseFloat(ethBal) * ethPrice;
      const tokensValue = tokenBalances.reduce((sum, t) => sum + t.valueUsd, 0);
      setTotalValueUsd(ethValue + tokensValue);

      setLoading(false);
    } catch (err) {
      console.error('Error loading portfolio:', err);
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };

  const formatPrice = (value: number) => {
    if (value >= 1) {
      return `$${value.toFixed(4)}`;
    } else if (value >= 0.0001) {
      return `$${value.toFixed(6)}`;
    } else {
      return `$${value.toFixed(8)}`;
    }
  };

  const formatNumber = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    } else if (num >= 1) {
      return num.toFixed(2);
    } else {
      return num.toFixed(6);
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
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white/10 backdrop-blur rounded-lg p-4">
            <div className="text-blue-100 text-sm mb-2">{t('portfolio.ethBalance')}</div>
            <div className="text-2xl font-bold mb-1">
              {parseFloat(ethBalance).toFixed(4)} ETH
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
        </div>
      </div>

      {/* Info Message */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800">
          {t('portfolio.infoMessage')}
        </p>
      </div>

      {/* Token Holdings */}
      {tokens.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <p className="text-gray-600 text-lg mb-6">{t('portfolio.noHoldings')}</p>
          <Link
            to="/tokens"
            className="inline-block px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md"
          >
            {t('portfolio.browseTokens')}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
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
      )}
    </div>
  );
}
