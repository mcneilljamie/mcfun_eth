import { X, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: () => void;
  isConnecting: boolean;
}

export function WalletModal({ isOpen, onClose, onConnect, isConnecting }: WalletModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

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

        <div className="p-6">
          <button
            onClick={() => {
              onConnect();
              onClose();
            }}
            disabled={isConnecting}
            className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center">
                <Wallet className="text-white" size={24} />
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900 group-hover:text-gray-900">MetaMask</p>
                <p className="text-sm text-gray-500">{t('wallet.connectToMetaMask')}</p>
              </div>
            </div>
            {isConnecting && (
              <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
            )}
          </button>

          <p className="text-xs text-gray-500 mt-4 text-center">
            {t('wallet.byConnecting')}
          </p>
        </div>
      </div>
    </div>
  );
}
