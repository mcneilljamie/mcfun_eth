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
    useGrouping: true,
  });
}

export function formatCurrency(value: string | number, symbol: string = 'ETH', decimals?: number): string {
  return `${formatNumber(value, decimals)} ${symbol}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function calculatePriceImpact(
  reserveIn: number,
  reserveOut: number,
  amountIn: number,
  amountOut: number
): number {
  if (reserveIn === 0 || reserveOut === 0) return 0;

  const oldPrice = reserveIn / reserveOut;
  const newReserveIn = reserveIn + amountIn;
  const newReserveOut = reserveOut - amountOut;
  const newPrice = newReserveIn / newReserveOut;
  const impact = ((newPrice - oldPrice) / oldPrice) * 100;

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

export function ethToUSD(ethAmount: string | number, ethPriceUSD: number): number {
  const eth = typeof ethAmount === 'string' ? parseFloat(ethAmount) : ethAmount;
  if (isNaN(eth)) return 0;
  return eth * ethPriceUSD;
}

export function formatUSD(value: number, abbreviated: boolean = false): string {
  if (isNaN(value) || value === 0) return '$0';

  if (abbreviated) {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    }
  }

  const decimals = value < 1 ? 4 : 2;

  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPrice(value: number): string {
  if (isNaN(value) || value === 0) return '0';
  const decimals = value < 1 ? 4 : 2;
  return value.toFixed(decimals);
}

export function getPriceDecimals(value: number): number {
  return value < 1 ? 4 : 2;
}

export function limitDecimalPrecision(value: string | number, maxDecimals: number = 18): string {
  const numStr = typeof value === 'number' ? value.toString() : value;
  const num = parseFloat(numStr);

  if (isNaN(num) || num === 0) return '0';

  // Handle scientific notation for very small numbers
  if (Math.abs(num) < 1e-18) return '0';

  // Convert to fixed decimal representation to avoid scientific notation
  // Use Math.floor to ensure we don't round up and exceed the actual value
  const factor = Math.pow(10, maxDecimals);
  const truncated = Math.floor(num * factor) / factor;

  // Convert to string with fixed decimals, then remove trailing zeros
  let result = truncated.toFixed(maxDecimals);

  // Remove trailing zeros and unnecessary decimal point
  result = result.replace(/\.?0+$/, '');

  // If result is empty or just a decimal point, return '0'
  if (result === '' || result === '.') return '0';

  return result;
}
