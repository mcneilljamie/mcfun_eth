import { useState, useEffect, useRef } from 'react';
import { Copy, LogOut, ExternalLink, Check } from 'lucide-react';
import { formatAddress } from '../lib/utils';
import { useWeb3 } from '../lib/web3';
import { useTranslation } from 'react-i18next';
import { getNetworkName, getExplorerUrl, isChainSupported } from '../contracts/addresses';

interface AccountDropdownProps {
  account: string;
  chainId: number | null;
  onDisconnect: () => void;
}

export function AccountDropdown({ account, chainId, onDisconnect }: AccountDropdownProps) {
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
      if (provider && account) {
        try {
          const bal = await provider.getBalance(account);
          setBalance((Number(bal) / 1e18).toFixed(4));
        } catch (error) {
          console.error('Failed to fetch balance:', error);
        }
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
        className="bg-gray-900 text-white px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium hover:bg-gray-800 transition-colors flex items-center space-x-2"
      >
        <div className="w-2 h-2 bg-green-400 rounded-full" />
        <span>{formatAddress(account)}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 z-50">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">{t('wallet.balance')}</span>
              <span className={`text-sm font-medium px-2 py-1 rounded-lg ${
                isSupported ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {networkName}
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{balance} ETH</div>
            <div className="text-sm text-gray-500 mt-1">{formatAddress(account, 16)}</div>
          </div>

          <div className="p-2">
            <button
              onClick={copyAddress}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
            >
              {copied ? (
                <>
                  <Check size={18} className="text-green-600" />
                  <span className="text-sm font-medium text-green-600">{t('wallet.copied')}</span>
                </>
              ) : (
                <>
                  <Copy size={18} className="text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">{t('wallet.copyAddress')}</span>
                </>
              )}
            </button>

            <button
              onClick={openInExplorer}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
            >
              <ExternalLink size={18} className="text-gray-600" />
              <span className="text-sm font-medium text-gray-900">{t('wallet.viewExplorer')}</span>
            </button>

            <div className="border-t border-gray-200 my-2" />

            <button
              onClick={() => {
                onDisconnect();
                setIsOpen(false);
              }}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-red-50 transition-colors text-left"
            >
              <LogOut size={18} className="text-red-600" />
              <span className="text-sm font-medium text-red-600">{t('wallet.disconnect')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
