import { useState, useEffect } from 'react';
import { X, Copy, CheckCircle, ExternalLink, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWeb3 } from '../lib/web3';
import { getExplorerUrl } from '../contracts/addresses';
import { ToastMessage } from '../App';

interface LockCelebrationProps {
  lockId: number;
  tokenSymbol: string;
  tokenName: string;
  tokenAddress: string;
  amountLocked: string;
  durationDays: number;
  unlockDate: Date;
  txHash: string;
  onClose: () => void;
  onShowToast: (toast: ToastMessage) => void;
}

export function LockCelebration({
  lockId,
  tokenSymbol,
  tokenName,
  tokenAddress,
  amountLocked,
  durationDays,
  unlockDate,
  txHash,
  onClose,
  onShowToast,
}: LockCelebrationProps) {
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
    }, 400);

    setTimeout(() => clearInterval(fireworkInterval), 5000);

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
  const shareableLink = `${window.location.origin}/lock/${lockId}`;

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
                className="absolute w-4 h-4 rounded-full animate-firework"
                style={{
                  background: `hsl(${Math.random() * 360}, 100%, 60%)`,
                  transform: `rotate(${i * 30}deg) translateY(0)`,
                  animation: `firework 1s ease-out forwards`,
                  animationDelay: `${Math.random() * 0.2}s`,
                }}
              />
            ))}
          </div>
        </div>
      ))}

      <style>{`
        @keyframes firework {
          0% {
            transform: rotate(var(--rotation, 0deg)) translateY(0);
            opacity: 1;
          }
          100% {
            transform: rotate(var(--rotation, 0deg)) translateY(-100px);
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
        `}</style>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <div className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full mb-4 animate-bounce">
              <Lock className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center">
              <Lock className="w-8 h-8 mr-2 text-green-600" />
              {t('lockCelebration.lockSuccessful')}
            </h2>
            <p className="text-lg text-gray-600">
              {t('lockCelebration.subtitle', { amount: amountLocked, symbol: tokenSymbol, days: durationDays })}
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border-2 border-blue-300">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <Lock className="w-5 h-5 mr-2 text-blue-600" />
                {t('lockCelebration.lockDetails')}
              </h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('lockCelebration.token')}:</span>
                  <span className="font-semibold text-gray-900">{tokenName} ({tokenSymbol})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('lockCelebration.amount')}:</span>
                  <span className="font-semibold text-gray-900">{amountLocked} {tokenSymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('lockCelebration.duration')}:</span>
                  <span className="font-semibold text-gray-900">{durationDays} {t('lockCelebration.days')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('lockCelebration.unlockDate')}:</span>
                  <span className="font-semibold text-gray-900">{unlockDate.toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border-2 border-purple-300">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <ExternalLink className="w-5 h-5 mr-2 text-purple-600" />
                {t('lockCelebration.shareLock')}
              </h3>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('lockCelebration.shareableLink')}
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={shareableLink}
                    readOnly
                    className="flex-1 px-3 py-2 bg-white border border-purple-300 rounded-lg text-sm font-mono"
                  />
                  <button
                    onClick={() => copyToClipboard(shareableLink, 'link')}
                    className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    title={t('lockCelebration.copyLink')}
                  >
                    {copiedItem === 'link' ? (
                      <CheckCircle className="w-5 h-5 text-white" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {t('lockCelebration.shareDescription')}
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <ExternalLink className="w-5 h-5 mr-2" />
                {t('lockCelebration.contractInfo')}
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('lockCelebration.tokenContract')}
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
                      title={t('lockCelebration.copyTokenAddress')}
                    >
                      {copiedItem === 'token' ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                    <a
                      href={`${explorerUrl}/token/${tokenAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title={t('lockCelebration.viewOnEtherscan')}
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('lockCelebration.transactionHash')}
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
                      title={t('lockCelebration.copyTxHash')}
                    >
                      {copiedItem === 'tx' ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                    <a
                      href={`${explorerUrl}/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title={t('lockCelebration.viewOnExplorer')}
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onClose}
                className="flex-1 bg-gray-900 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
              >
                {t('lockCelebration.close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
