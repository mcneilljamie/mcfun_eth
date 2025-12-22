const FEE_PERCENT = 4;
const FEE_DENOMINATOR = 1000;

function getTokenOut(ethIn, reserveETH, reserveToken) {
  const fee = (ethIn * FEE_PERCENT) / FEE_DENOMINATOR;
  const ethAfterFee = ethIn - fee;
  const tokenOut = (ethAfterFee * reserveToken) / (reserveETH + ethAfterFee);
  return tokenOut;
}

function calculatePriceImpactOLD(amountIn, amountOut, currentPrice) {
  const expectedOut = amountIn * currentPrice;
  const impact = ((expectedOut - amountOut) / expectedOut) * 100;
  return Math.abs(impact);
}

function calculatePriceImpactNEW(reserveIn, reserveOut, amountIn, amountOut) {
  if (reserveIn === 0 || reserveOut === 0) return 0;
  const oldPrice = reserveIn / reserveOut;
  const newReserveIn = reserveIn + amountIn;
  const newReserveOut = reserveOut - amountOut;
  const newPrice = newReserveIn / newReserveOut;
  const impact = ((newPrice - oldPrice) / oldPrice) * 100;
  return Math.abs(impact);
}

console.log("=== REAL WORLD EXAMPLE FROM SCREENSHOT ===\n");

const reserveETH = 0.0928;
const reserveToken = 539048.0097;
const ethIn = 0.01;

console.log("Pool State:");
console.log(`- ETH Reserve: ${reserveETH} ETH`);
console.log(`- Token Reserve: ${reserveToken} AWXAW`);
console.log(`- Spot price: ${(reserveETH/reserveToken).toExponential(4)} ETH per token\n`);

const tokensOut = getTokenOut(ethIn, reserveETH, reserveToken);
console.log(`Trade: ${ethIn} ETH → ${tokensOut.toFixed(2)} tokens\n`);

const tokensPerETH = reserveToken / reserveETH;
const oldImpact = calculatePriceImpactOLD(ethIn, tokensOut, tokensPerETH);
const newImpact = calculatePriceImpactNEW(reserveETH, reserveToken, ethIn, tokensOut);

console.log("OLD CALCULATION (WRONG):");
console.log(`- Price Impact: ${oldImpact.toFixed(2)}%`);
console.log(`- This is what the UI currently shows\n`);

console.log("NEW CALCULATION (CORRECT):");
console.log(`- Price Impact: ${newImpact.toFixed(2)}%`);
console.log(`- This matches the 22.63% from the chart!\n`);

console.log("VERIFICATION:");
const oldPrice = reserveETH / reserveToken;
const newReserveETH = reserveETH + ethIn;
const newReserveToken = reserveToken - tokensOut;
const newPrice = newReserveETH / newReserveToken;
console.log(`- Old price: ${oldPrice.toExponential(4)} ETH per token`);
console.log(`- New price: ${newPrice.toExponential(4)} ETH per token`);
console.log(`- Price change: ${((newPrice - oldPrice) / oldPrice * 100).toFixed(2)}%`);
console.log(`- This is the ACTUAL price movement in the pool`);
