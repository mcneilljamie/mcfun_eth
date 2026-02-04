import { useState, useEffect } from 'react';
import { X, Wallet, Shield, ExternalLink } from 'lucide-react';
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
      id: 'rabby' as const,
      name: 'Rabby Wallet',
      status: 'Recent',
      icon: (
        <svg className="w-7 h-7" viewBox="0 0 40 40" fill="none">
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
      status: null,
      icon: (
        <svg className="w-7 h-7" viewBox="0 0 40 40" fill="none">
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
    {
      id: 'metamask' as const,
      name: 'MetaMask',
      status: null,
      icon: (
        <svg className="w-7 h-7" viewBox="0 0 40 40" fill="none">
          <path d="M37.5 16.25L22.5 2.5L18.75 9.375L15 6.25L12.5 10L7.5 7.5L2.5 16.25L7.5 25L12.5 22.5L15 26.25L18.75 23.125L22.5 30L37.5 16.25Z" fill="#E17726"/>
          <path d="M22.5 30L18.75 23.125L15 26.25L12.5 22.5L7.5 25L12.5 37.5L22.5 30Z" fill="#E27625"/>
          <path d="M37.5 16.25L22.5 30L12.5 37.5L17.5 40L27.5 32.5L37.5 25V16.25Z" fill="#D5BFB2"/>
        </svg>
      ),
      available: availableWallets.metamask,
      downloadUrl: 'https://metamask.io/download/',
    },
  ];

  const installedWallets = wallets.filter(w => w.available);
  const popularWallets = wallets;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl transform transition-all flex overflow-hidden sm:h-[580px] max-h-[85vh]">
        {/* Left Panel - Wallet List */}
        <div className="w-full sm:w-2/5 sm:border-r border-gray-200 flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">{t('wallet.connectWallet')}</h2>
            <button
              onClick={onClose}
              className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Installed Section */}
            {installedWallets.length > 0 && (
              <div className="p-4">
                <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3 px-2">
                  {t('wallet.installed')}
                </h3>
                <div className="space-y-1">
                  {installedWallets.map((wallet) => (
                    <button
                      key={wallet.id}
                      onClick={() => {
                        onConnect(wallet.id);
                        onClose();
                      }}
                      disabled={isConnecting}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left group"
                    >
                      <div className="flex-shrink-0">
                        {wallet.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">
                          {wallet.name}
                        </p>
                        {wallet.status && (
                          <p className="text-xs text-blue-600 font-medium">
                            {wallet.status}
                          </p>
                        )}
                      </div>
                      {isConnecting && (
                        <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Popular Section */}
            <div className="p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-2">
                {t('wallet.popular')}
              </h3>
              <div className="space-y-1">
                {popularWallets.map((wallet) => (
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
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left group"
                  >
                    <div className="flex-shrink-0">
                      {wallet.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">
                        {wallet.name}
                      </p>
                    </div>
                    {isConnecting && wallet.available && (
                      <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Educational Content - Hidden on mobile */}
        <div className="hidden sm:flex flex-1 bg-gray-50 p-8 flex-col">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">
            {t('wallet.whatIsWallet')}
          </h2>

          <div className="space-y-6 flex-1">
            {/* Card 1 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-2">
                  {t('wallet.digitalAssetsTitle')}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {t('wallet.digitalAssetsDescription')}
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-white" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-2">
                  {t('wallet.newWayToLoginTitle')}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {t('wallet.newWayToLoginDescription')}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6">
            <button
              onClick={() => window.open('https://walletradar.org', '_blank')}
              className="w-full flex items-center justify-center gap-2 text-blue-600 font-semibold py-3 px-4 hover:text-blue-700 transition-colors"
            >
              {t('wallet.learnMore')}
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
