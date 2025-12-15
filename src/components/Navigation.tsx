import { useState } from 'react';
import { useWeb3 } from '../lib/web3';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './LanguageSelector';
import { WalletModal } from './WalletModal';
import { AccountDropdown } from './AccountDropdown';
import { ToastMessage } from '../App';

interface NavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  setToast: (toast: ToastMessage | null) => void;
}

export function Navigation({ currentPage, onNavigate, setToast }: NavigationProps) {
  const { account, connect, disconnect, isConnecting, chainId } = useWeb3();
  const { t } = useTranslation();
  const [showWalletModal, setShowWalletModal] = useState(false);

  const handleConnect = async (walletType?: 'metamask' | 'rabby' | 'phantom') => {
    try {
      await connect(walletType);
      setToast({ message: t('wallet.connected'), type: 'success' });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : t('wallet.connectionFailed'),
        type: 'error'
      });
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setToast({ message: t('wallet.disconnected'), type: 'info' });
  };

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <button
              onClick={() => onNavigate('home')}
              className="flex items-center space-x-2 text-gray-900 font-bold text-lg sm:text-xl hover:text-gray-700 transition-colors"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-900 text-white rounded-lg flex items-center justify-center font-bold text-base sm:text-lg">
                MF
              </div>
              <span className="hidden xs:inline">{t('nav.brand')}</span>
            </button>

            <div className="hidden md:flex space-x-1">
              <button
                onClick={() => onNavigate('launch')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'launch'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.launch')}
              </button>
              <button
                onClick={() => onNavigate('trade')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'trade'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.trade')}
              </button>
              <button
                onClick={() => onNavigate('tokens')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'tokens'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.tokens')}
              </button>
              <button
                onClick={() => onNavigate('portfolio')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'portfolio'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.portfolio')}
              </button>
              <button
                onClick={() => onNavigate('about')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'about'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.about')}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSelector />
            {account ? (
              <AccountDropdown
                account={account}
                chainId={chainId}
                onDisconnect={handleDisconnect}
                onShowToast={setToast}
              />
            ) : (
              <button
                onClick={() => setShowWalletModal(true)}
                disabled={isConnecting}
                className="bg-gray-900 text-white px-4 sm:px-6 py-2 rounded-lg text-sm sm:text-base font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="hidden sm:inline">{isConnecting ? t('nav.connecting') : t('nav.connectWallet')}</span>
                <span className="sm:hidden">{isConnecting ? t('nav.connecting') : t('nav.connect')}</span>
              </button>
            )}
          </div>
        </div>

        <div className="md:hidden flex space-x-1 pb-3">
          <button
            onClick={() => onNavigate('launch')}
            className={`flex-1 px-2 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
              currentPage === 'launch'
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t('nav.launchShort')}
          </button>
          <button
            onClick={() => onNavigate('trade')}
            className={`flex-1 px-2 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
              currentPage === 'trade'
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t('nav.trade')}
          </button>
          <button
            onClick={() => onNavigate('tokens')}
            className={`flex-1 px-2 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
              currentPage === 'tokens'
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t('nav.tokensShort')}
          </button>
          <button
            onClick={() => onNavigate('portfolio')}
            className={`flex-1 px-2 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
              currentPage === 'portfolio'
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t('nav.portfolio')}
          </button>
          <button
            onClick={() => onNavigate('about')}
            className={`flex-1 px-2 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
              currentPage === 'about'
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t('nav.about')}
          </button>
        </div>
      </div>

      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onConnect={handleConnect}
        isConnecting={isConnecting}
      />
    </nav>
  );
}
