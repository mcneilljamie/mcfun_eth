import { useState, useEffect } from 'react';
import { X, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (walletType?: 'metamask' | 'rabby' | 'phantom') => void;
  isConnecting: boolean;
}

export function WalletModal({ isOpen, onClose, onConnect, isConnecting }: WalletModalProps) {
  const { t } = useTranslation();
  const [availableWallets, setAvailableWallets] = useState({
    metamask: false,
    rabby: false,
    phantom: false,
  });

  useEffect(() => {
    if (isOpen) {
      setAvailableWallets({
        metamask: !!(window.ethereum?.isMetaMask && !window.ethereum?.isRabby),
        rabby: !!window.rabby,
        phantom: !!window.phantom?.ethereum,
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const wallets = [
    {
      id: 'metamask' as const,
      name: 'MetaMask',
      description: t('wallet.connectToMetaMask'),
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none">
          <path d="M37.5 16.25L22.5 2.5L18.75 9.375L15 6.25L12.5 10L7.5 7.5L2.5 16.25L7.5 25L12.5 22.5L15 26.25L18.75 23.125L22.5 30L37.5 16.25Z" fill="#E17726"/>
          <path d="M22.5 30L18.75 23.125L15 26.25L12.5 22.5L7.5 25L12.5 37.5L22.5 30Z" fill="#E27625"/>
          <path d="M37.5 16.25L22.5 30L12.5 37.5L17.5 40L27.5 32.5L37.5 25V16.25Z" fill="#D5BFB2"/>
        </svg>
      ),
      available: availableWallets.metamask,
      downloadUrl: 'https://metamask.io/download/',
    },
    {
      id: 'rabby' as const,
      name: 'Rabby Wallet',
      description: t('wallet.connectToRabby'),
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="8" fill="#8697FF"/>
          <path d="M20 10C14.477 10 10 14.477 10 20C10 25.523 14.477 30 20 30C25.523 30 30 25.523 30 20C30 14.477 25.523 10 20 10Z" fill="white"/>
          <path d="M24 17L18 23L16 21" stroke="#8697FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      available: availableWallets.rabby,
      downloadUrl: 'https://rabby.io/',
    },
    {
      id: 'phantom' as const,
      name: 'Phantom',
      description: t('wallet.connectToPhantom'),
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="8" fill="url(#phantom-gradient)"/>
          <path d="M20 28C24.4183 28 28 24.4183 28 20C28 15.5817 24.4183 12 20 12C15.5817 12 12 15.5817 12 20C12 24.4183 15.5817 28 20 28Z" fill="white"/>
          <circle cx="17" cy="19" r="1.5" fill="#AB9FF2"/>
          <circle cx="23" cy="19" r="1.5" fill="#AB9FF2"/>
          <defs>
            <linearGradient id="phantom-gradient" x1="0" y1="0" x2="40" y2="40">
              <stop stopColor="#AB9FF2"/>
              <stop offset="1" stopColor="#6A4FFF"/>
            </linearGradient>
          </defs>
        </svg>
      ),
      available: availableWallets.phantom,
      downloadUrl: 'https://phantom.app/',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl transform transition-all">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">{t('wallet.connectWallet')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => {
                if (wallet.available) {
                  onConnect(wallet.id);
                  onClose();
                } else {
                  window.open(wallet.downloadUrl, '_blank');
                }
              }}
              disabled={isConnecting}
              className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 flex items-center justify-center">
                  {wallet.icon}
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-900 group-hover:text-gray-900">
                    {wallet.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {wallet.available ? wallet.description : t('wallet.notInstalled')}
                  </p>
                </div>
              </div>
              {isConnecting ? (
                <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
              ) : !wallet.available ? (
                <span className="text-xs text-blue-600 font-medium">{t('wallet.install')}</span>
              ) : null}
            </button>
          ))}

          <p className="text-xs text-gray-500 mt-4 text-center">
            {t('wallet.byConnecting')}
          </p>
        </div>
      </div>
    </div>
  );
}
