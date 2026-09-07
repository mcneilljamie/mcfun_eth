export interface PriceChangeInputs {
  isNew: boolean;
  hasRecentTrades: boolean;
  launchPriceUsd: number;
  lastPriceUsd: number;
  price24hAgoUsd: number;
}

/**
 * Single source of truth for the price-change percentage shown across the app.
 * New tokens (< 24h old) are measured against their launch price; older tokens
 * against the price 24 hours ago. Returns null when there is nothing meaningful
 * to show (no recent trades or a missing baseline), which callers render as a dash.
 */
export function calculatePriceChangePercent({
  isNew,
  hasRecentTrades,
  launchPriceUsd,
  lastPriceUsd,
  price24hAgoUsd,
}: PriceChangeInputs): number | null {
  if (!hasRecentTrades || lastPriceUsd <= 0) return null;

  const baseline = isNew ? launchPriceUsd : price24hAgoUsd;
  if (baseline <= 0) return null;

  return ((lastPriceUsd - baseline) / baseline) * 100;
}
