import { useTranslation } from 'react-i18next';
import { SUPPORTED_CHAIN_IDS, getNetworkShortName } from '../contracts/addresses';

interface ChainFilterProps {
  selectedChain: number | 'all';
  onChainChange: (chainId: number | 'all') => void;
}

export function ChainFilter({ selectedChain, onChainChange }: ChainFilterProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChainChange('all')}
        className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
          selectedChain === 'all'
            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:bg-gray-700'
        }`}
      >
        {t('tokens.allChains')}
      </button>
      {SUPPORTED_CHAIN_IDS.map((chainId) => (
        <button
          key={chainId}
          onClick={() => onChainChange(chainId)}
          className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            selectedChain === chainId
              ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:bg-gray-700'
          }`}
        >
          {getNetworkShortName(chainId)}
        </button>
      ))}
    </div>
  );
}
