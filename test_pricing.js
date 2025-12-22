// Test AMM pricing calculations

const FEE_PERCENT = 4;
const FEE_DENOMINATOR = 1000;

// ETH to Token
function getTokenOut(ethIn, reserveETH, reserveToken) {
  const fee = (ethIn * FEE_PERCENT) / FEE_DENOMINATOR;
  const ethAfterFee = ethIn - fee;
  const tokenOut = (ethAfterFee * reserveToken) / (reserveETH + ethAfterFee);
  console.log("\n=== ETH → Token ===");
  console.log(`Input: ${ethIn} ETH`);
  console.log(`Fee: ${fee} ETH (${(fee/ethIn*100).toFixed(4)}%)`);
  console.log(`ETH after fee: ${ethAfterFee} ETH`);
  console.log(`Token out: ${tokenOut} tokens`);
  console.log(`Effective price: ${ethIn/tokenOut} ETH per token`);
  return tokenOut;
}

// Token to ETH
function getETHOut(tokenIn, reserveETH, reserveToken) {
  const ethBeforeFee = (tokenIn * reserveETH) / (reserveToken + tokenIn);
  const fee = (ethBeforeFee * FEE_PERCENT) / FEE_DENOMINATOR;
  const ethOut = ethBeforeFee - fee;
  console.log("\n=== Token → ETH ===");
  console.log(`Input: ${tokenIn} tokens`);
  console.log(`ETH before fee: ${ethBeforeFee} ETH`);
  console.log(`Fee: ${fee} ETH (${(fee/ethBeforeFee*100).toFixed(4)}%)`);
  console.log(`ETH out: ${ethOut} ETH`);
  console.log(`Effective price: ${ethOut/tokenIn} ETH per token`);
  return ethOut;
}

// Price impact calculation (from Trade.tsx)
function calculatePriceImpact(amountIn, amountOut, currentPrice) {
  const expectedOut = amountIn * currentPrice;
  const impact = ((expectedOut - amountOut) / expectedOut) * 100;
  console.log(`\nPrice Impact Calculation:`);
  console.log(`Amount in: ${amountIn}`);
  console.log(`Current price: ${currentPrice}`);
  console.log(`Expected out (at spot price): ${expectedOut}`);
  console.log(`Actual out (with fees + AMM slippage): ${amountOut}`);
  console.log(`Difference: ${expectedOut - amountOut}`);
  console.log(`Impact: ${impact.toFixed(4)}%`);

  // Break down the components
  const noFeeOut = amountIn * currentPrice;
  const ammSlippage = (noFeeOut - amountOut) / noFeeOut * 100;
  console.log(`\nBreakdown:`);
  console.log(`- Fee component: ~0.4%`);
  console.log(`- Total impact (fee + AMM): ${ammSlippage.toFixed(4)}%`);

  return Math.abs(impact);
}

// Test with realistic reserves
const reserveETH = 1.0;
const reserveToken = 1000000;

console.log("=== Pool State ===");
console.log(`Reserve ETH: ${reserveETH}`);
console.log(`Reserve Token: ${reserveToken}`);
console.log(`Spot price: ${reserveETH/reserveToken} ETH per token`);
console.log(`Spot price: ${reserveToken/reserveETH} tokens per ETH`);

// Test 1: Small buy
console.log("\n\n--- Test 1: Buy 0.1 ETH worth ---");
const ethIn = 0.1;
const tokensOut = getTokenOut(ethIn, reserveETH, reserveToken);
const tokensPerETH = reserveToken / reserveETH;
calculatePriceImpact(ethIn, tokensOut, tokensPerETH);

// Test 2: Large buy
console.log("\n\n--- Test 2: Buy 0.5 ETH worth ---");
const ethIn2 = 0.5;
const tokensOut2 = getTokenOut(ethIn2, reserveETH, reserveToken);
calculatePriceImpact(ethIn2, tokensOut2, tokensPerETH);

// Test 3: Small sell
console.log("\n\n--- Test 3: Sell 10000 tokens ---");
const tokenIn = 10000;
const ethOut = getETHOut(tokenIn, reserveETH, reserveToken);
const ethPerToken = reserveETH / reserveToken;
calculatePriceImpact(tokenIn, ethOut, ethPerToken);
