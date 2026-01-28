import { useState, useEffect, useRef } from 'react';
import { Copy, LogOut, ExternalLink, Check } from 'lucide-react';
import { formatAddress } from '../lib/utils';
import { useWeb3 } from '../lib/web3';
import { useTranslation } from 'react-i18next';
import { getNetworkName, getExplorerUrl, isChainSupported } from '../contracts/addresses';
import { ethers } from 'ethers';

interface AccountDropdownProps {
  account: string;
  chainId: number | null;
  onDisconnect: () => void;
  onShowToast: (toast: { message: string; type: 'success' | 'error' | 'info' }) => void;
}

export function AccountDropdown({ account, chainId, onDisconnect, onShowToast }: AccountDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<string>('0');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { provider } = useWeb3();
  const { t } = useTranslation();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchBalance = async () => {
      console.log('=== Balance Fetch Debug ===');
      console.log('Provider exists:', !!provider);
      console.log('Account:', account);

      if (provider && account) {
        try {
          console.log('Calling getBalance...');
          const bal = await provider.getBalance(account);
          console.log('Raw balance (wei):', bal.toString());
          const formatted = ethers.formatEther(bal);
          console.log('Formatted balance (ETH):', formatted);
          const final = parseFloat(formatted).toFixed(4);
          console.log('Final balance:', final);
          setBalance(final);
        } catch (error) {
          console.error('Failed to fetch balance:', error);
          setBalance('Error');
        }
      } else {
        console.log('Skipping fetch - missing provider or account');
        if (!provider) console.log('Provider is null');
        if (!account) console.log('Account is null');
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [provider, account]);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onShowToast({
      message: t('common.copiedToClipboard'),
      type: 'success'
    });
  };

  const openInExplorer = () => {
    const explorerUrl = getExplorerUrl(chainId || 1);
    window.open(`${explorerUrl}/address/${account}`, '_blank');
  };

  const isSupported = chainId ? isChainSupported(chainId) : true;
  const networkName = chainId ? getNetworkName(chainId) : 'Unknown';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group bg-gradient-to-r from-gray-900 to-gray-800 text-white pl-3 pr-4 sm:pl-3 sm:pr-5 py-2.5 rounded-xl text-sm sm:text-base font-semibold hover:from-gray-800 hover:to-gray-700 transition-all duration-200 flex items-center gap-2.5 shadow-lg hover:shadow-xl hover:scale-105 border border-gray-700"
      >
        <div className="relative">
          <div className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />
          <div className="absolute inset-0 w-2.5 h-2.5 bg-green-400 rounded-full animate-ping" />
        </div>
        <span className="font-mono tracking-wide">{formatAddress(account)}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 animate-in slide-in-from-top-2 duration-200">
          <div className="p-5 border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('wallet.balance')}</span>
              <span className={`text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm ${
                isSupported
                  ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white'
                  : 'bg-gradient-to-r from-red-400 to-rose-500 text-white'
              }`}>
                {networkName}
              </span>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent mb-2">
              {balance} ETH
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 font-mono bg-gray-100 px-3 py-2 rounded-lg">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              {formatAddress(account)}
            </div>
          </div>

          <div className="p-2">
            <button
              onClick={copyAddress}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-all text-left group"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                copied ? 'bg-green-100' : 'bg-gray-100 group-hover:bg-gray-200'
              }`}>
                {copied ? (
                  <Check size={18} className="text-green-600" />
                ) : (
                  <Copy size={18} className="text-gray-600 group-hover:text-gray-900" />
                )}
              </div>
              <span className={`text-sm font-semibold transition-colors ${
                copied ? 'text-green-600' : 'text-gray-900'
              }`}>
                {copied ? t('wallet.copied') : t('wallet.copyAddress')}
              </span>
            </button>

            <button
              onClick={openInExplorer}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-all text-left group"
            >
              <div className="w-9 h-9 bg-gray-100 group-hover:bg-gray-200 rounded-lg flex items-center justify-center transition-all">
                <ExternalLink size={18} className="text-gray-600 group-hover:text-gray-900" />
              </div>
              <span className="text-sm font-semibold text-gray-900">{t('wallet.viewExplorer')}</span>
            </button>

            <div className="border-t border-gray-200 my-2" />

            <button
              onClick={() => {
                onDisconnect();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 transition-all text-left group"
            >
              <div className="w-9 h-9 bg-red-50 group-hover:bg-red-100 rounded-lg flex items-center justify-center transition-all">
                <LogOut size={18} className="text-red-600" />
              </div>
              <span className="text-sm font-semibold text-red-600">{t('wallet.disconnect')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
