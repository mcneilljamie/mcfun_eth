export function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatNumber(value: string | number, decimals: number = 4): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';

  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';

  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function formatCurrency(value: string | number, symbol: string = 'ETH'): string {
  return `${formatNumber(value)} ${symbol}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function calculatePriceImpact(
  amountIn: number,
  amountOut: number,
  currentPrice: number
): number {
  if (amountIn === 0 || currentPrice === 0) return 0;

  const expectedOut = amountIn * currentPrice;
  const impact = ((expectedOut - amountOut) / expectedOut) * 100;

  return Math.abs(impact);
}

export function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const time = new Date(timestamp).getTime();
  const diff = now - time;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

export function classNames(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
