import { useState, useEffect } from 'react';
import { X, Copy, CheckCircle, ExternalLink, CheckCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWeb3 } from '../lib/web3';
import { getExplorerUrl } from '../contracts/addresses';
import { formatNumber } from '../lib/utils';
import { ToastMessage } from '../App';

interface SwapConfirmationProps {
  amountIn: string;
  amountOut: string;
  tokenSymbol: string;
  tokenAddress: string;
  ammAddress: string;
  txHash: string;
  isETHToToken: boolean;
  onClose: () => void;
  onViewToken: () => void;
  onShowToast: (toast: ToastMessage) => void;
}

export function SwapConfirmation({
  amountIn,
  amountOut,
  tokenSymbol,
  tokenAddress,
  ammAddress,
  txHash,
  isETHToToken,
  onClose,
  onViewToken,
  onShowToast,
}: SwapConfirmationProps) {
  const { t } = useTranslation();
  const { chainId } = useWeb3();
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [fireworks, setFireworks] = useState<Array<{ id: number; x: number; y: number }>>([]);

  useEffect(() => {
    const fireworkInterval = setInterval(() => {
      const newFirework = {
        id: Date.now() + Math.random(),
        x: Math.random() * 100,
        y: Math.random() * 60 + 20,
      };
      setFireworks((prev) => [...prev, newFirework]);
      setTimeout(() => {
        setFireworks((prev) => prev.filter((fw) => fw.id !== newFirework.id));
      }, 2000);
    }, 300);

    setTimeout(() => clearInterval(fireworkInterval), 4000);

    return () => clearInterval(fireworkInterval);
  }, []);

  const copyToClipboard = async (text: string, item: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(item);
      setTimeout(() => setCopiedItem(null), 2000);
      onShowToast({
        message: t('common.copiedToClipboard'),
        type: 'success'
      });
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const explorerUrl = getExplorerUrl(chainId || 11155111);
  const txExplorerUrl = `${explorerUrl}/tx/${txHash}`;
  const tokenExplorerUrl = `${explorerUrl}/token/${tokenAddress}`;
  const poolExplorerUrl = `${explorerUrl}/address/${ammAddress}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      {fireworks.map((fw) => (
        <div
          key={fw.id}
          className="absolute pointer-events-none"
          style={{
            left: `${fw.x}%`,
            top: `${fw.y}%`,
          }}
        >
          <div className="relative">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="absolute w-3 h-3 rounded-full animate-firework"
                style={{
                  background: `hsl(${Math.random() * 360}, 100%, 60%)`,
                  transform: `rotate(${i * 30}deg) translateY(0)`,
                  animation: `firework 1.2s ease-out forwards`,
                  animationDelay: `${Math.random() * 0.15}s`,
                }}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative animate-scale-in">
        <style>{`
          @keyframes scale-in {
            from {
              transform: scale(0.9);
              opacity: 0;
            }
            to {
              transform: scale(1);
              opacity: 1;
            }
          }
          .animate-scale-in {
            animation: scale-in 0.3s ease-out;
          }
          @keyframes firework {
            0% {
              transform: rotate(var(--rotation, 0deg)) translateY(0);
              opacity: 1;
            }
            100% {
              transform: rotate(var(--rotation, 0deg)) translateY(-120px);
              opacity: 0;
            }
          }
          .animate-firework:nth-child(1) { --rotation: 0deg; }
          .animate-firework:nth-child(2) { --rotation: 30deg; }
          .animate-firework:nth-child(3) { --rotation: 60deg; }
          .animate-firework:nth-child(4) { --rotation: 90deg; }
          .animate-firework:nth-child(5) { --rotation: 120deg; }
          .animate-firework:nth-child(6) { --rotation: 150deg; }
          .animate-firework:nth-child(7) { --rotation: 180deg; }
          .animate-firework:nth-child(8) { --rotation: 210deg; }
          .animate-firework:nth-child(9) { --rotation: 240deg; }
          .animate-firework:nth-child(10) { --rotation: 270deg; }
          .animate-firework:nth-child(11) { --rotation: 300deg; }
          .animate-firework:nth-child(12) { --rotation: 330deg; }
        `}</style>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <div className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full mb-4">
              <CheckCheck className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {t('swapConfirmation.title')}
            </h2>
            <p className="text-lg text-gray-600">
              {t('swapConfirmation.subtitle')}
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
              <h3 className="font-semibold text-gray-900 mb-4">{t('swapConfirmation.swapDetails')}</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">{t('swapConfirmation.youPaid')}</span>
                  <span className="font-semibold text-gray-900">
                    {formatNumber(amountIn, isETHToToken ? 6 : 4)} {isETHToToken ? 'ETH' : tokenSymbol}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">{t('swapConfirmation.youReceived')}</span>
                  <span className="font-semibold text-gray-900">
                    {formatNumber(amountOut, isETHToToken ? 4 : 6)} {isETHToToken ? tokenSymbol : 'ETH'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <ExternalLink className="w-5 h-5 mr-2" />
                {t('swapConfirmation.transactionInfo')}
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('swapConfirmation.transactionHash')}
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={txHash}
                      readOnly
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(txHash, 'tx')}
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title={t('swapConfirmation.copyTxHash')}
                    >
                      {copiedItem === 'tx' ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                    <a
                      href={txExplorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title={t('swapConfirmation.viewOnExplorer')}
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('swapConfirmation.tokenContract')}
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={tokenAddress}
                      readOnly
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(tokenAddress, 'token')}
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title={t('swapConfirmation.copyTokenAddress')}
                    >
                      {copiedItem === 'token' ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                    <a
                      href={tokenExplorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title={t('swapConfirmation.viewOnEtherscan')}
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('swapConfirmation.dexPool')}
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={ammAddress}
                      readOnly
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(ammAddress, 'pool')}
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title={t('swapConfirmation.copyPoolAddress')}
                    >
                      {copiedItem === 'pool' ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                    <a
                      href={poolExplorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title={t('swapConfirmation.viewOnEtherscan')}
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onViewToken}
                className="flex-1 bg-gray-900 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
              >
                {t('swapConfirmation.goToToken')}
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-gray-100 text-gray-900 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                {t('swapConfirmation.makeAnotherSwap')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
