# Price Chart Improvements

## Overview
Fixed the price chart display issues by optimizing data flow, improving empty state handling, and adding intelligent timeframe selection based on token age.

## Key Changes

### 1. Data Flow Optimization
- **Simplified snapshot system**: Reduced complexity in merging local and database snapshots
- **Added minimum interval**: Local snapshots now require 10 seconds between captures to prevent duplicate timestamps
- **Improved data aggregation**: Implemented `aggregateDataPoints()` function to reduce data density while preserving price trends
- **Target data points by timeframe**:
  - 15M: 30 points
  - 1H: 60 points
  - 24H: 100 points
  - 7D: 150 points
  - ALL: 200 points

### 2. Enhanced Empty State Handling
- **Very new tokens** (< 1 hour): Shows current price with message "Building price history..."
- **Insufficient data** (< 2 points): Shows current price with message "Collecting more data points..."
- **No data**: Shows helpful message based on token state

### 3. Smart Timeframe Selection
Added dynamic timeframe availability based on token age:
- **< 15 minutes old**: Only 15M available
- **15 min - 1 hour**: 15M, 1H available
- **1 hour - 24 hours**: 15M, 1H, 24H available
- **1 day - 7 days**: 1H, 24H, 7D available
- **> 7 days**: 1H, 24H, 7D, ALL available

This prevents showing empty timeframes for new tokens.

### 4. Chart Rendering Improvements
- **Data validation**: Filters out invalid data points (zero, NaN, infinite values)
- **Flat price handling**: Special handling for tokens with minimal price variation (< 0.1% range)
- **Enhanced precision**: Increases decimal places for very flat price charts
- **Auto-scaling**: Adjusts price scale margins for better visualization of small price movements

### 5. UI/UX Enhancements
- **Data point counter**: Shows number of data points being displayed
- **Responsive timeframe buttons**: Adapts to screen size with flex-wrap
- **Live updates**: Reduced interval from 30s to 15s for more responsive charts
- **Better price change calculation**: Handles edge cases where first price equals current price

## Technical Details

### Local Snapshot Capture
```typescript
// Captures every 15 seconds instead of 30 seconds
// Only adds if 10+ seconds since last snapshot
// Keeps maximum of 50 local snapshots
```

### Data Aggregation
```typescript
// Aggregates data points by averaging prices within intervals
// Maintains chronological order and time accuracy
// Reduces chart complexity without losing trend information
```

### Chart Data Validation
```typescript
// Filters: value > 0, !isNaN, isFinite
// Deduplicates timestamps within 5 seconds
// Ensures monotonically increasing time values
```

## Smart Contract Integration
The chart correctly reads from the McFunAMM contract:
- `getPrice()` - Returns current token price in ETH (reserveETH * 1e18 / reserveToken)
- Uses same calculation as database snapshots for consistency
- Handles zero reserves gracefully

## Database Query Optimization
- Queries filtered by timeframe at database level
- Orders by created_at ascending for chronological display
- Aggregates post-query to balance server load and accuracy

## Result
Charts now display correctly for:
- New tokens with limited history
- Tokens with flat prices (minimal trading activity)
- Tokens with sparse data points
- Tokens with varying levels of historical data

The timeframe buttons are no longer redundant - they intelligently control data granularity and show only relevant timeframes based on token age.
