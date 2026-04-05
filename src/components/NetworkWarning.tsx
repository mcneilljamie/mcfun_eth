import { AlertTriangle, X, ArrowRight, Wifi } from 'lucide-react';
import { useWeb3 } from '../lib/web3';
import { isChainSupported, getNetworkName, DEFAULT_CHAIN_ID } from '../contracts/addresses';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

export function NetworkWarning() {
  const { chainId, switchNetwork, account } = useWeb3();
  const { t } = useTranslation();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  if (!account || !chainId || isChainSupported(chainId) || isDismissed) {
    return null;
  }

  const handleSwitchNetwork = async () => {
    try {
      setIsSwitching(true);
      await switchNetwork(DEFAULT_CHAIN_ID);
    } catch (error) {
      console.error('Failed to switch network:', error);
      setIsSwitching(false);
    }
  };

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-2xl px-4 animate-slide-up">
      <div className="relative bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-800 dark:to-gray-900 border-2 border-red-300 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-400/10 to-orange-400/10" />

        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500 animate-pulse" />

        <button
          onClick={() => setIsDismissed(true)}
          className="absolute top-4 right-4 z-10 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-all duration-200"
        >
          <X size={20} />
        </button>

        <div className="relative p-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0 relative">
              <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl animate-pulse" />
              <div className="relative w-14 h-14 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
                <AlertTriangle className="w-7 h-7 text-white" strokeWidth={2.5} />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-red-900 mb-2 flex items-center gap-2">
                {t('network.warning.title')}
                <Wifi className="w-5 h-5 text-red-600 animate-pulse" />
              </h3>

              <p className="text-sm text-red-800 mb-4 leading-relaxed">
                {t('network.warning.description', {
                  current: getNetworkName(chainId),
                  required: getNetworkName(DEFAULT_CHAIN_ID),
                })}
              </p>

              <div className="bg-white dark:bg-gray-800/60 backdrop-blur-sm border border-red-200 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="font-semibold text-red-900">Current:</span>
                    <span className="text-red-700">{getNetworkName(chainId)}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-red-400" />
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="font-semibold text-green-900">Required:</span>
                    <span className="text-green-700">{getNetworkName(DEFAULT_CHAIN_ID)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSwitchNetwork}
                disabled={isSwitching}
                className="group relative bg-gradient-to-r from-red-600 to-orange-600 text-white px-6 py-3 rounded-xl text-sm font-bold hover:from-red-700 hover:to-orange-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
              >
                {isSwitching ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Switching...</span>
                  </>
                ) : (
                  <>
                    <span>{t('network.warning.switchButton', { network: getNetworkName(DEFAULT_CHAIN_ID) })}</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
