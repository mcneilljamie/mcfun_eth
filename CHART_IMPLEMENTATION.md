# Price Chart Implementation

## Overview

A comprehensive price charting system has been implemented using TradingView's lightweight-charts library, integrated with real on-chain data to calculate and display token prices in USD.

## Architecture

### Database Layer

#### 1. Tables
- **price_snapshots**: Stores historical price data points
  - `token_address`: Token identifier
  - `price_eth`: Price in ETH
  - `eth_price_usd`: ETH price at snapshot time
  - `eth_reserve`: ETH reserves in AMM
  - `token_reserve`: Token reserves in AMM
  - `created_at`: Timestamp
  - `is_interpolated`: Flag for interpolated vs real data

- **eth_price_history**: Tracks historical ETH prices
  - `timestamp`: Time of price record
  - `price_usd`: ETH price in USD
  - `created_at`: Record creation time

#### 2. Database Functions

**`get_price_chart_data(token_address, hours_back, max_points)`**
- Intelligently fetches and samples price data
- Automatically adjusts granularity based on data volume
- Prevents overwhelming the client with too many data points
- Returns time-series data with USD prices pre-calculated

#### 3. Indexes
- `idx_price_snapshots_token_time`: Optimizes queries by token and time
- `idx_swaps_token_time`: Supports historical price reconstruction

#### 4. Data Collection Strategy

**Tiered Snapshot Frequencies:**
- **Every 15 seconds**: Tokens < 24 hours old (high volatility)
- **Every 10 minutes**: Tokens 1-7 days old (moderate activity)
- **Every 1 hour**: Tokens > 7 days old (established tokens)

**ETH Price Tracking:**
- Continuous tracking from CoinGecko API
- Stored in `eth_price_history` table
- Used to calculate accurate USD values

### Frontend Components

#### 1. PriceChart Component (`src/components/PriceChart.tsx`)

**Features:**
- Area chart visualization with color coding (green for gains, red for losses)
- Interactive chart with zoom and pan capabilities
- Current price display with 24h change percentage
- Time range selection (1H, 24H, 7D, 30D, ALL)
- Loading and error states
- Auto-refresh every 30 seconds
- Theme support (light/dark)
- Responsive design

**Props:**
- `tokenAddress`: The token to display
- `tokenSymbol`: Symbol for display
- `theme`: 'light' or 'dark' (default: 'dark')

#### 2. TimeRangeSelector Component (`src/components/TimeRangeSelector.tsx`)

**Features:**
- Quick time range selection buttons
- Visual feedback for selected range
- Theme support for different page designs

**Props:**
- `selected`: Current selected range
- `onChange`: Callback when range changes
- `theme`: 'light' or 'dark' (default: 'dark')

#### 3. useChartData Hook (`src/hooks/useChartData.ts`)

**Responsibilities:**
- Fetches chart data from database via RPC call
- Calculates price change percentage
- Transforms data into TradingView format
- Handles loading, error, and empty states
- Provides refetch capability

**Returns:**
- `data`: Array of chart data points
- `loading`: Loading state
- `error`: Error message if any
- `priceChange`: Percentage change over time range
- `currentPrice`: Most recent price
- `refetch`: Function to manually refresh data

## Data Flow

```
1. On-chain events (swaps, trades) → Event Indexer
2. Event Indexer → Updates tokens table with reserves
3. Cron Jobs → Trigger price-snapshot edge function
4. price-snapshot → Reads reserves + ETH price → Stores in price_snapshots
5. track-eth-price → Continuously updates eth_price_history
6. Frontend → Calls get_price_chart_data() → Receives formatted data
7. PriceChart → Renders with lightweight-charts
8. Auto-refresh every 30s → Updates chart in real-time
```

## Integration

The chart is integrated into the TokenDetail page:

```tsx
<PriceChart
  tokenAddress={token.token_address}
  tokenSymbol={token.symbol}
  theme="light"
/>
```

Position: Between the token statistics section and the information cards.

## USD Price Calculation

Token prices are calculated using the following formula:

```
price_eth = eth_reserve / token_reserve
price_usd = price_eth * eth_price_usd
```

Where:
- `eth_reserve` and `token_reserve` come from the AMM contract
- `eth_price_usd` comes from the `eth_price_history` table

## Data Sampling Strategy

To maintain performance, the system uses intelligent sampling:

**For large datasets (>500 points):**
- Groups snapshots by minute
- Takes the first snapshot per minute
- Reduces data transfer while maintaining accuracy

**For small datasets (<500 points):**
- Returns all available data points
- Ensures maximum detail for newer tokens

## Time Range Handling

Different time ranges use different data granularities:

| Range | Ideal Granularity | Data Points |
|-------|-------------------|-------------|
| 1H    | 15 seconds        | ~240        |
| 24H   | 1 minute          | ~1,440      |
| 7D    | 10 minutes        | ~1,008      |
| 30D   | 1 hour            | ~720        |
| ALL   | 1-4 hours         | Variable    |

The database function automatically samples data to stay under 500 points for optimal rendering.

## Chart Customization

The chart uses TradingView's lightweight-charts library with these customizations:

**Visual Style:**
- Area chart with gradient fill
- Dynamic colors based on price movement (green/red)
- Grid lines for readability
- Time scale with hour/minute display
- Price scale with 8 decimal precision

**Interactions:**
- Hover to see exact price at any point
- Zoom with mouse wheel or pinch
- Pan with click and drag
- Crosshair for precise value reading

## Real-time Updates

The chart updates automatically through two mechanisms:

1. **Client-side polling**: Every 30 seconds
2. **Database cron jobs**: Continuous snapshot collection

This ensures users always see fresh data without manual refresh.

## Empty State Handling

The chart gracefully handles edge cases:

- **No data yet**: Shows message for newly launched tokens
- **Loading**: Displays spinner with status message
- **Error**: Shows error with retry button
- **Single data point**: Still displays with context

## Performance Optimizations

1. **Database indexing**: Fast queries by token and time
2. **Data sampling**: Limits response size
3. **Efficient queries**: RPC function reduces round trips
4. **Client-side caching**: React hooks prevent unnecessary refetches
5. **Debounced updates**: Prevents excessive re-renders

## Future Enhancements

Potential improvements for the chart system:

1. **Candlestick charts**: Add OHLC view option
2. **Volume overlay**: Show trading volume bars
3. **Multiple tokens**: Compare prices across tokens
4. **Technical indicators**: Moving averages, RSI, etc.
5. **Export functionality**: Download chart as image
6. **Price alerts**: Notify on price targets
7. **Advanced tooltips**: More detailed hover information
8. **Historical annotations**: Mark significant events

## Maintenance

### Adding New Time Ranges

To add a new time range:

1. Update `TimeRange` type in `useChartData.ts`
2. Add to `TIME_RANGE_HOURS` constant
3. Update `TIME_RANGES` array in `TimeRangeSelector.tsx`
4. Add display text in PriceChart component

### Adjusting Snapshot Frequencies

To modify how often snapshots are taken:

1. Edit cron schedules in migration files
2. Update edge function filtering logic
3. Adjust `get_price_chart_data` sampling logic if needed

### Changing Chart Appearance

Chart styling can be modified in `PriceChart.tsx`:

- **Colors**: Edit `lineColor`, `topColor`, `bottomColor`
- **Grid**: Modify `vertLines` and `horzLines` colors
- **Height**: Adjust `height` property
- **Price precision**: Change `priceFormat.precision`

## Testing the Implementation

To verify the chart is working:

1. **Check data exists**: Query `price_snapshots` table
2. **Verify ETH prices**: Check `eth_price_history` table
3. **Test time ranges**: Switch between 1H, 24H, 7D, etc.
4. **Observe updates**: Wait 30 seconds for auto-refresh
5. **Check responsiveness**: Resize browser window
6. **Test interactions**: Hover, zoom, pan the chart

## Troubleshooting

**Chart shows "No data available":**
- Check if price snapshots exist for the token
- Verify cron jobs are running
- Run `price-snapshot` edge function manually

**Prices seem incorrect:**
- Verify ETH price data in `eth_price_history`
- Check token reserves in `price_snapshots`
- Ensure `get_price_chart_data` function is working

**Chart not updating:**
- Check browser console for errors
- Verify Supabase connection
- Ensure auto-refresh interval is running

**Performance issues:**
- Check if data sampling is working (should max 500 points)
- Verify database indexes exist
- Monitor network requests in DevTools
