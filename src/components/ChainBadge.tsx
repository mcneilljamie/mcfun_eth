import { getNetworkShortName } from '../contracts/addresses';

interface ChainBadgeProps {
  chainId: number;
  size?: 'sm' | 'md';
}

export function ChainBadge({ chainId, size = 'sm' }: ChainBadgeProps) {
  const networkName = getNetworkShortName(chainId);

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  const colorClasses = chainId === 8453
    ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    : 'bg-purple-500/20 text-purple-300 border-purple-500/30';

  return (
    <span className={`inline-flex items-center ${sizeClasses} rounded-full font-medium border ${colorClasses}`}>
      {networkName}
    </span>
  );
}
