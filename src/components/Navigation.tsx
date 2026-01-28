import { useState } from 'react';
import { useWeb3 } from '../lib/web3';
import { useTranslation } from 'react-i18next';
import { Menu, X } from 'lucide-react';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const handleNavigate = (page: string) => {
    onNavigate(page);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4 md:space-x-8">
            <button
              onClick={() => handleNavigate('home')}
              className="flex items-center space-x-2 text-gray-900 font-bold text-lg sm:text-xl hover:text-gray-700 transition-colors"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-900 text-white rounded-lg flex items-center justify-center font-bold text-base sm:text-lg">
                MF
              </div>
              <span className="hidden sm:inline">{t('nav.brand')}</span>
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
                onClick={() => onNavigate('lock')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'lock'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.lock')}
              </button>
              <button
                onClick={() => onNavigate('my-locks')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'my-locks'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.myLocks')}
              </button>
              <button
                onClick={() => onNavigate('burn')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'burn'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.burn')}
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

          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden sm:block">
              <LanguageSelector />
            </div>
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
                className="bg-gray-900 text-white px-3 sm:px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isConnecting ? t('nav.connecting') : t('nav.connect')}
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-gray-200">
            <div className="flex flex-col space-y-1">
              <button
                onClick={() => handleNavigate('launch')}
                className={`px-4 py-3 text-left rounded-lg font-medium transition-colors ${
                  currentPage === 'launch'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.launch')}
              </button>
              <button
                onClick={() => handleNavigate('trade')}
                className={`px-4 py-3 text-left rounded-lg font-medium transition-colors ${
                  currentPage === 'trade'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.trade')}
              </button>
              <button
                onClick={() => handleNavigate('tokens')}
                className={`px-4 py-3 text-left rounded-lg font-medium transition-colors ${
                  currentPage === 'tokens'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.tokens')}
              </button>
              <button
                onClick={() => handleNavigate('portfolio')}
                className={`px-4 py-3 text-left rounded-lg font-medium transition-colors ${
                  currentPage === 'portfolio'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.portfolio')}
              </button>
              <button
                onClick={() => handleNavigate('lock')}
                className={`px-4 py-3 text-left rounded-lg font-medium transition-colors ${
                  currentPage === 'lock'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.lock')}
              </button>
              <button
                onClick={() => handleNavigate('my-locks')}
                className={`px-4 py-3 text-left rounded-lg font-medium transition-colors ${
                  currentPage === 'my-locks'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.myLocks')}
              </button>
              <button
                onClick={() => handleNavigate('burn')}
                className={`px-4 py-3 text-left rounded-lg font-medium transition-colors ${
                  currentPage === 'burn'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.burn')}
              </button>
              <button
                onClick={() => handleNavigate('about')}
                className={`px-4 py-3 text-left rounded-lg font-medium transition-colors ${
                  currentPage === 'about'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.about')}
              </button>
              <div className="sm:hidden px-4 py-2">
                <LanguageSelector />
              </div>
            </div>
          </div>
        )}
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
