import { useTranslation } from 'react-i18next';
import { SUPPORTED_CHAIN_IDS, getNetworkShortName } from '../contracts/addresses';

interface ChainFilterProps {
  selectedChain: number | 'all';
  onChainChange: (chainId: number | 'all') => void;
}

export function ChainFilter({ selectedChain, onChainChange }: ChainFilterProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-1">
      <button
        onClick={() => onChainChange('all')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          selectedChain === 'all'
            ? 'bg-blue-600 text-white'
            : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
        }`}
      >
        All Chains
      </button>
      {SUPPORTED_CHAIN_IDS.map((chainId) => (
        <button
          key={chainId}
          onClick={() => onChainChange(chainId)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            selectedChain === chainId
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          {getNetworkShortName(chainId)}
        </button>
      ))}
    </div>
  );
}
