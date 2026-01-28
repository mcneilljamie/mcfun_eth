import { useState, useEffect } from 'react';
import { X, Wallet, ArrowRight, Download } from 'lucide-react';
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
        <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
          <path d="M37.5 16.25L22.5 2.5L18.75 9.375L15 6.25L12.5 10L7.5 7.5L2.5 16.25L7.5 25L12.5 22.5L15 26.25L18.75 23.125L22.5 30L37.5 16.25Z" fill="#E17726"/>
          <path d="M22.5 30L18.75 23.125L15 26.25L12.5 22.5L7.5 25L12.5 37.5L22.5 30Z" fill="#E27625"/>
          <path d="M37.5 16.25L22.5 30L12.5 37.5L17.5 40L27.5 32.5L37.5 25V16.25Z" fill="#D5BFB2"/>
        </svg>
      ),
      available: availableWallets.metamask,
      downloadUrl: 'https://metamask.io/download/',
      gradient: 'from-orange-50 to-amber-50',
      hoverGradient: 'group-hover:from-orange-100 group-hover:to-amber-100',
    },
    {
      id: 'rabby' as const,
      name: 'Rabby Wallet',
      description: t('wallet.connectToRabby'),
      icon: (
        <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="8" fill="#8697FF"/>
          <path d="M20 10C14.477 10 10 14.477 10 20C10 25.523 14.477 30 20 30C25.523 30 30 25.523 30 20C30 14.477 25.523 10 20 10Z" fill="white"/>
          <path d="M24 17L18 23L16 21" stroke="#8697FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      available: availableWallets.rabby,
      downloadUrl: 'https://rabby.io/',
      gradient: 'from-blue-50 to-indigo-50',
      hoverGradient: 'group-hover:from-blue-100 group-hover:to-indigo-100',
    },
    {
      id: 'phantom' as const,
      name: 'Phantom',
      description: t('wallet.connectToPhantom'),
      icon: (
        <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
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
      gradient: 'from-purple-50 to-pink-50',
      hoverGradient: 'group-hover:from-purple-100 group-hover:to-pink-100',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl max-w-md w-full shadow-2xl transform transition-all animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative p-6 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-900 to-gray-700 rounded-2xl flex items-center justify-center shadow-lg">
              <Wallet className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{t('wallet.connectWallet')}</h2>
              <p className="text-sm text-gray-500">{t('wallet.chooseWallet')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-1.5 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-3">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => {
                if (wallet.available) {
                  onConnect(wallet.id);
                } else {
                  window.open(wallet.downloadUrl, '_blank');
                }
              }}
              disabled={isConnecting}
              className={`group w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden ${
                wallet.available
                  ? 'border-gray-200 hover:border-gray-900 hover:shadow-lg hover:scale-[1.02]'
                  : 'border-dashed border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${wallet.gradient} ${wallet.hoverGradient} transition-all opacity-0 group-hover:opacity-100`} />

              <div className="flex items-center gap-4 relative z-10">
                <div className="w-14 h-14 flex items-center justify-center bg-white rounded-xl shadow-sm group-hover:shadow-md transition-shadow">
                  {wallet.icon}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900 text-lg">
                      {wallet.name}
                    </p>
                    {wallet.available && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                        Ready
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">
                    {wallet.available ? wallet.description : t('wallet.notInstalled')}
                  </p>
                </div>
              </div>

              <div className="relative z-10">
                {isConnecting ? (
                  <div className="w-6 h-6 border-3 border-gray-900 border-t-transparent rounded-full animate-spin" />
                ) : wallet.available ? (
                  <ArrowRight className="text-gray-400 group-hover:text-gray-900 group-hover:translate-x-1 transition-all" size={24} />
                ) : (
                  <Download className="text-blue-600" size={20} />
                )}
              </div>
            </button>
          ))}

          <div className="pt-4 border-t border-gray-200 mt-6">
            <p className="text-xs text-gray-500 text-center leading-relaxed">
              {t('wallet.byConnecting')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
