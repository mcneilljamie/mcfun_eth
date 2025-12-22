import { X, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface WithdrawSuccessProps {
  isOpen: boolean;
  onClose: () => void;
  txHash: string;
  chainId: number;
  tokenSymbol: string;
  amount: string;
}

export function WithdrawSuccess({ isOpen, onClose, txHash, chainId, tokenSymbol, amount }: WithdrawSuccessProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const getExplorerUrl = (chainId: number, txHash: string) => {
    if (chainId === 1) {
      return `https://etherscan.io/tx/${txHash}`;
    } else if (chainId === 11155111) {
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    }
    return `https://etherscan.io/tx/${txHash}`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const explorerUrl = getExplorerUrl(chainId, txHash);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {t('withdrawSuccess.title')}
          </h2>
          <p className="text-gray-600">
            {t('withdrawSuccess.subtitle', { amount, symbol: tokenSymbol })}
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {t('withdrawSuccess.transactionHash')}
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  {t('withdrawSuccess.copied')}
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  {t('withdrawSuccess.copy')}
                </>
              )}
            </button>
          </div>
          <div className="font-mono text-xs text-gray-600 break-all bg-white rounded p-2">
            {txHash}
          </div>
        </div>

        <div className="flex gap-3">
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            {t('withdrawSuccess.viewOnExplorer')}
          </a>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 text-gray-900 px-4 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            {t('withdrawSuccess.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
