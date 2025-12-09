import { AlertTriangle, X } from 'lucide-react';
import { useWeb3 } from '../lib/web3';
import { isChainSupported, getNetworkName, DEFAULT_CHAIN_ID } from '../contracts/addresses';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

export function NetworkWarning() {
  const { chainId, switchNetwork, account } = useWeb3();
  const { t } = useTranslation();
  const [isDismissed, setIsDismissed] = useState(false);

  if (!account || !chainId || isChainSupported(chainId) || isDismissed) {
    return null;
  }

  const handleSwitchNetwork = async () => {
    try {
      await switchNetwork(DEFAULT_CHAIN_ID);
    } catch (error) {
      console.error('Failed to switch network:', error);
    }
  };

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-lg px-4">
      <div className="bg-red-50 border-2 border-red-200 rounded-xl shadow-lg p-4 relative">
        <button
          onClick={() => setIsDismissed(true)}
          className="absolute top-3 right-3 text-red-400 hover:text-red-600 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-red-900 mb-1">
              {t('network.warning.title')}
            </h3>
            <p className="text-sm text-red-800 mb-3">
              {t('network.warning.description', {
                current: getNetworkName(chainId),
                required: getNetworkName(DEFAULT_CHAIN_ID),
              })}
            </p>
            <button
              onClick={handleSwitchNetwork}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              {t('network.warning.switchButton', { network: getNetworkName(DEFAULT_CHAIN_ID) })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
