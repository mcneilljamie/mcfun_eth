import { Contract, parseEther, formatEther, formatUnits, MaxUint256 } from 'ethers';
import { MCFUN_FACTORY_ABI, MCFUN_AMM_ABI, ERC20_ABI } from '../contracts/abis';
import { getFactoryAddress } from '../contracts/addresses';

export interface TokenLaunchParams {
  name: string;
  symbol: string;
  liquidityPercent: number;
  ethAmount: string;
}

export interface SwapParams {
  ammAddress: string;
  isETHToToken: boolean;
  amountIn: string;
  minAmountOut: string;
}

export async function createToken(signer: any, params: TokenLaunchParams) {
  const network = await signer.provider.getNetwork();
  const factoryAddress = getFactoryAddress(Number(network.chainId));
  const factory = new Contract(factoryAddress, MCFUN_FACTORY_ABI, signer);

  const tx = await factory.createToken(
    params.name,
    params.symbol,
    params.liquidityPercent,
    { value: parseEther(params.ethAmount) }
  );

  const receipt = await tx.wait();

  const event = receipt?.logs
    .map((log: any) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((log: any) => log?.name === 'TokenLaunched');

  return {
    tokenAddress: event?.args.tokenAddress,
    ammAddress: event?.args.ammAddress,
    txHash: receipt?.hash,
  };
}

export async function swapTokens(
  signer: any,
  params: SwapParams,
  onApprovalSent?: () => void,
  onSwapSent?: () => void
) {
  const amm = new Contract(params.ammAddress, MCFUN_AMM_ABI, signer);

  let tx;
  if (params.isETHToToken) {
    tx = await amm.swapETHForToken(
      parseEther(params.minAmountOut),
      { value: parseEther(params.amountIn) }
    );
    onSwapSent?.();
  } else {
    const tokenAddress = await amm.token();
    const token = new Contract(tokenAddress, ERC20_ABI, signer);

    const allowance = await token.allowance(await signer.getAddress(), params.ammAddress);
    const amountIn = parseEther(params.amountIn);

    if (allowance < amountIn) {
      const approveTx = await token.approve(params.ammAddress, MaxUint256);
      onApprovalSent?.();
      await approveTx.wait();
    }

    tx = await amm.swapTokenForETH(amountIn, parseEther(params.minAmountOut));
    onSwapSent?.();
  }

  return await tx.wait();
}

export async function checkNeedsApproval(
  provider: any,
  params: { ammAddress: string; amountIn: string; userAddress: string }
): Promise<boolean> {
  try {
    const amm = new Contract(params.ammAddress, MCFUN_AMM_ABI, provider);
    const tokenAddress = await amm.token();
    const token = new Contract(tokenAddress, ERC20_ABI, provider);

    const allowance = await token.allowance(params.userAddress, params.ammAddress);
    const amountIn = parseEther(params.amountIn);

    // Consider unlimited approval as sufficient
    // MaxUint256 / 2 is used as threshold to handle any potential decrease in allowance
    const hasUnlimitedApproval = allowance > MaxUint256 / 2n;

    return !hasUnlimitedApproval && allowance < amountIn;
  } catch (err) {
    console.error('Failed to check approval:', err);
    return true;
  }
}

export async function getAMMReserves(provider: any, ammAddress: string) {
  const amm = new Contract(ammAddress, MCFUN_AMM_ABI, provider);

  const [reserveETH, reserveToken, tokenAddress] = await Promise.all([
    amm.reserveETH(),
    amm.reserveToken(),
    amm.token(),
  ]);

  return {
    reserveETH: formatEther(reserveETH),
    reserveToken: formatEther(reserveToken),
    tokenAddress,
  };
}

export async function getPrice(provider: any, ammAddress: string) {
  const amm = new Contract(ammAddress, MCFUN_AMM_ABI, provider);
  const price = await amm.getPrice();
  return formatEther(price);
}

export async function getQuote(
  provider: any,
  ammAddress: string,
  isETHToToken: boolean,
  amountIn: string
) {
  const amm = new Contract(ammAddress, MCFUN_AMM_ABI, provider);

  if (isETHToToken) {
    const tokenOut = await amm.getTokenOut(parseEther(amountIn));
    return formatEther(tokenOut);
  } else {
    const ethOut = await amm.getETHOut(parseEther(amountIn));
    return formatEther(ethOut);
  }
}

export async function getTokenInfo(provider: any, tokenAddress: string) {
  const token = new Contract(tokenAddress, ERC20_ABI, provider);

  const [name, symbol, decimals, totalSupply] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
    token.totalSupply(),
  ]);

  return {
    name,
    symbol,
    decimals,
    totalSupply: formatUnits(totalSupply, decimals),
  };
}

export async function getTokenBalance(provider: any, tokenAddress: string, userAddress: string) {
  const token = new Contract(tokenAddress, ERC20_ABI, provider);
  const balance = await token.balanceOf(userAddress);
  return formatEther(balance);
}

export async function getETHBalance(provider: any, userAddress: string) {
  const balance = await provider.getBalance(userAddress);
  return formatEther(balance);
}
