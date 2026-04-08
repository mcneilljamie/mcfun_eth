interface ChainBadgeProps {
  chainId: number;
  size?: 'sm' | 'md';
}

const CHAIN_CONFIG: Record<number, { label: string; dot: string }> = {
  1: { label: 'ETH', dot: 'bg-gray-400' },
  8453: { label: 'BASE', dot: 'bg-blue-400' },
};

export function ChainBadge({ chainId, size = 'sm' }: ChainBadgeProps) {
  const config = CHAIN_CONFIG[chainId] ?? { label: `${chainId}`, dot: 'bg-gray-400' };
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  const colorClasses = chainId === 8453
    ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
    : 'bg-gray-500/15 text-gray-300 border-gray-500/30';

  return (
    <span
      title={chainId === 8453 ? 'Base' : 'Ethereum'}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full border ${colorClasses}`}
    >
      <span className={`${dotSize} rounded-full ${config.dot} flex-shrink-0`} />
    </span>
  );
}
