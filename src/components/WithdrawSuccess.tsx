import { X, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../lib/utils';
import { getExplorerUrl, DEFAULT_CHAIN_ID } from '../contracts/addresses';

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const explorerUrl = `${getExplorerUrl(chainId || DEFAULT_CHAIN_ID)}/tx/${txHash}`;
  const formattedAmount = formatNumber(amount, 4);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:text-gray-400 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {t('withdrawSuccess.title')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {t('withdrawSuccess.subtitle', { amount: formattedAmount, symbol: tokenSymbol })}
          </p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('withdrawSuccess.transactionHash')}
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors"
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
          <div className="font-mono text-xs text-gray-600 dark:text-gray-400 break-all bg-white dark:bg-gray-800 rounded p-2">
            {txHash}
          </div>
        </div>

        <div className="flex gap-3">
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            {t('withdrawSuccess.viewOnExplorer')}
          </a>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 dark:bg-gray-700 transition-colors"
          >
            {t('withdrawSuccess.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
