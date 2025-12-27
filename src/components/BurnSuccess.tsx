import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Copy, CheckCircle, ExternalLink, Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWeb3 } from '../lib/web3';
import { getExplorerUrl } from '../contracts/addresses';
import { ToastMessage } from '../App';

interface BurnSuccessProps {
  tokenSymbol: string;
  tokenName: string;
  tokenAddress: string;
  amountBurned: string;
  txHash: string;
  onClose: () => void;
  onShowToast: (toast: ToastMessage) => void;
}

export function BurnSuccess({
  tokenSymbol,
  tokenName,
  tokenAddress,
  amountBurned,
  txHash,
  onClose,
  onShowToast,
}: BurnSuccessProps) {
  const { t } = useTranslation();
  const { chainId } = useWeb3();
  const navigate = useNavigate();
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [flames, setFlames] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const formatNumber = (value: string) => {
    const num = parseFloat(value);
    return num.toLocaleString('en-US', { maximumFractionDigits: 6 });
  };

  const formattedAmount = formatNumber(amountBurned);

  useEffect(() => {
    const flameInterval = setInterval(() => {
      const newFlame = {
        id: Date.now() + Math.random(),
        x: Math.random() * 100,
        y: Math.random() * 60 + 20,
      };
      setFlames((prev) => [...prev, newFlame]);
      setTimeout(() => {
        setFlames((prev) => prev.filter((f) => f.id !== newFlame.id));
      }, 2000);
    }, 300);

    setTimeout(() => clearInterval(flameInterval), 5000);

    return () => clearInterval(flameInterval);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      {flames.map((flame) => (
        <div
          key={flame.id}
          className="absolute pointer-events-none"
          style={{
            left: `${flame.x}%`,
            top: `${flame.y}%`,
          }}
        >
          <div className="relative">
            <Flame
              className="w-8 h-8 text-orange-500 animate-flame"
              style={{
                filter: 'drop-shadow(0 0 10px rgba(251, 146, 60, 0.8))',
              }}
            />
          </div>
        </div>
      ))}

      <style>{`
        @keyframes flame {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          50% {
            transform: translateY(-20px) scale(1.2);
            opacity: 0.8;
          }
          100% {
            transform: translateY(-60px) scale(0.5);
            opacity: 0;
          }
        }
        .animate-flame {
          animation: flame 2s ease-out forwards;
        }
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
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-400 to-red-600 rounded-full mb-4 animate-bounce">
              <Flame className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center">
              <Flame className="w-8 h-8 mr-2 text-orange-600" />
              {t('burn.success')}
            </h2>
            <p className="text-lg text-gray-600">
              {t('burn.successDescription', { amount: formattedAmount, symbol: tokenSymbol })}
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-orange-50 to-red-100 rounded-xl p-6 border-2 border-orange-300">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <Flame className="w-5 h-5 mr-2 text-orange-600" />
                {t('burn.burnDetails')}
              </h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('burn.token')}:</span>
                  <span className="font-semibold text-gray-900">{tokenName} ({tokenSymbol})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('burn.amountBurned')}:</span>
                  <span className="font-semibold text-gray-900">{formattedAmount} {tokenSymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('burn.status')}:</span>
                  <span className="font-semibold text-green-600">{t('burn.permanentlyDestroyed')}</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <ExternalLink className="w-5 h-5 mr-2" />
                {t('burn.contractInfo')}
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('burn.tokenContract')}
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
                      title={t('burn.copyTokenAddress')}
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
                      title={t('burn.viewOnExplorer')}
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('burn.transactionHash')}
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
                      title={t('burn.copyTxHash')}
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
                      title={t('burn.viewTxOnExplorer')}
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  navigate(`/token/${tokenAddress}`);
                  onClose();
                }}
                className="flex-1 bg-orange-600 text-white py-3 rounded-lg font-semibold hover:bg-orange-700 transition-colors flex items-center justify-center"
              >
                <Flame className="w-5 h-5 mr-2" />
                {t('burn.viewToken')}
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-gray-900 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
