import { useEffect, useMemo, useState } from 'react';
import {
  Coins,
  Wallet,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Calculator as CalculatorIcon,
  ArrowDownToLine,
  Server,
  Flame,
} from 'lucide-react';
import { useTreasury } from '../hooks/useTreasury';
import { TREASURY_ADDRESS } from '../lib/treasury';
import { formatAddress, formatNumber, formatUSD, formatTimeAgo } from '../lib/utils';

const HOLDINGS_STORAGE_KEY = 'treasury_mcfun_holdings';

function chainLabel(chainId: number): string {
  if (chainId === 1) return 'Ethereum';
  if (chainId === 8453) return 'Base';
  return `Chain ${chainId}`;
}

export function Treasury() {
  const {
    balances,
    ethPriceUsd,
    circulatingSupply,
    ethPerMcfun,
    deposits,
    loading,
    error,
    depositsError,
    lastUpdated,
    reload,
  } = useTreasury();

  const [holdings, setHoldings] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(HOLDINGS_STORAGE_KEY);
    if (saved) setHoldings(saved);
  }, []);

  const handleHoldingsChange = (value: string) => {
    let cleaned = value.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) {
      cleaned =
        cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    }
    if (circulatingSupply && cleaned !== '' && cleaned !== '.') {
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed) && parsed > circulatingSupply) {
        cleaned = String(circulatingSupply);
      }
    }
    setHoldings(cleaned);
    localStorage.setItem(HOLDINGS_STORAGE_KEY, cleaned);
  };

  const holdingsDisplay = useMemo(() => {
    if (!holdings) return '';
    const [intPart, ...rest] = holdings.split('.');
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return holdings.includes('.') ? `${withCommas}.${rest.join('')}` : withCommas;
  }, [holdings]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(TREASURY_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable, ignore
    }
  };

  const backing = useMemo(() => {
    const amount = parseFloat(holdings);
    if (isNaN(amount) || amount <= 0 || !ethPerMcfun) return null;
    const eth = amount * ethPerMcfun;
    return { eth, usd: eth * ethPriceUsd };
  }, [holdings, ethPerMcfun, ethPriceUsd]);

  const totalEth = balances?.total ?? 0;
  const totalUsd = totalEth * ethPriceUsd;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-xl bg-green-600/10 text-green-600 dark:text-green-400 flex items-center justify-center">
          <Coins className="w-6 h-6" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">Treasury</h1>
      </div>

      <p className="text-gray-600 dark:text-gray-300 leading-relaxed max-w-3xl mb-8">
        McFun's revenue is retained as ETH in the treasury. A small portion may be used for
        maintenance and hosting, and some may go toward protocol-owned liquidity, buybacks and
        burns, but the majority is held long term. Over the long term, the goal is simple: to grow
        the amount of ETH backing each MCFUN.
      </p>

      {/* Live balance */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 sm:p-8 mb-6 transition-colors">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <Wallet className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wide">Total ETH in Treasury</span>
          </div>
          <button
            onClick={reload}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error ? (
          <div className="text-red-600 dark:text-red-400">
            Couldn't load the treasury balance right now. Please try refreshing.
          </div>
        ) : loading && !balances ? (
          <div className="h-12 flex items-center">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-green-600" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white">
                {formatNumber(totalEth, 4)} ETH
              </span>
              <span className="text-xl sm:text-2xl font-semibold text-green-700 dark:text-green-400">
                {formatUSD(totalUsd)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl px-4 py-3">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Ethereum</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatNumber(balances?.ethereum ?? 0, 4)} ETH
                </div>
                <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  {formatUSD((balances?.ethereum ?? 0) * ethPriceUsd)}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl px-4 py-3">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Base</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatNumber(balances?.base ?? 0, 4)} ETH
                </div>
                <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  {formatUSD((balances?.base ?? 0) * ethPriceUsd)}
                </div>
              </div>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <span className="text-sm text-gray-500 dark:text-gray-400">Treasury address</span>
          <code className="text-sm font-mono text-gray-900 dark:text-gray-200 bg-gray-100 dark:bg-gray-700/60 px-2 py-1 rounded">
            <span className="sm:hidden">{formatAddress(TREASURY_ADDRESS)}</span>
            <span className="hidden sm:inline">{TREASURY_ADDRESS}</span>
          </code>
          <button
            onClick={copyAddress}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            aria-label="Copy address"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
          </button>
          <a
            href={`https://app.zerion.io/${TREASURY_ADDRESS.toLowerCase()}/overview`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-green-700 dark:text-green-400 hover:underline"
          >
            View <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        {lastUpdated && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            Updated {formatTimeAgo(lastUpdated.toISOString())}
          </div>
        )}
      </div>

      {/* Calculator */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 sm:p-8 mb-6 transition-colors">
        <div className="flex items-center gap-2 mb-1">
          <CalculatorIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Your look through ETH exposure</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Enter how many MCFUN you hold to see the ETH currently backing them.
        </p>

        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          MCFUN holdings
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={holdingsDisplay}
          onChange={(e) => handleHoldingsChange(e.target.value)}
          placeholder="e.g. 1000"
          className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
        />
        {circulatingSupply && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Capped at the circulating supply of {formatNumber(circulatingSupply, 0)} MCFUN.
          </p>
        )}

        <div className="mt-5">
          <div className="bg-green-600/10 rounded-xl px-4 py-4">
            <div className="text-xs text-green-700 dark:text-green-400 mb-1 font-medium">
              ETH backing your holdings
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {backing ? `${formatNumber(backing.eth, 6)} ETH` : '—'}
            </div>
            {backing && (
              <div className="text-sm text-green-700 dark:text-green-400 mt-0.5">
                {formatUSD(backing.usd)}
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5" />
          Backing per token = total treasury ETH divided by MCFUN supply after burns.
        </p>
      </div>

      {/* Recent additions */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 sm:p-8 transition-colors">
        <div className="flex items-center gap-2 mb-5">
          <ArrowDownToLine className="w-5 h-5 text-green-600 dark:text-green-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Recent treasury additions</h2>
        </div>

        {depositsError ? (
          <div className="text-gray-500 dark:text-gray-400 py-6 text-center">
            Couldn't load recent additions right now.
          </div>
        ) : loading && deposits.length === 0 ? (
          <div className="py-6 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
          </div>
        ) : deposits.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 py-6 text-center">
            No recent ETH deposits found.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {deposits.map((d) => (
              <a
                key={`${d.chainId}-${d.hash}`}
                href={d.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 py-3 group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-green-700 dark:text-green-400">
                      +{formatUSD(d.valueEth * ethPriceUsd)}
                    </span>
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {chainLabel(d.chainId)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    from {formatAddress(d.from)} · {formatTimeAgo(new Date(d.timestamp * 1000).toISOString())}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <code className="hidden sm:inline text-xs font-mono text-gray-400 dark:text-gray-500">
                    {formatAddress(d.hash)}
                  </code>
                  <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors" />
                </div>
              </a>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-5 flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5" />
          Incoming ETH transfers to the treasury across Ethereum and Base.
        </p>
      </div>
    </div>
  );
}
