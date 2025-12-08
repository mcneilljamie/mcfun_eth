import { Contract, parseEther, formatEther, formatUnits } from 'ethers';
import { MCFUN_FACTORY_ABI, MCFUN_AMM_ABI, ERC20_ABI } from '../contracts/abis';
import { MCFUN_FACTORY_ADDRESS } from '../contracts/addresses';

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
  const factory = new Contract(MCFUN_FACTORY_ADDRESS, MCFUN_FACTORY_ABI, signer);

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

export async function swapTokens(signer: any, params: SwapParams) {
  const amm = new Contract(params.ammAddress, MCFUN_AMM_ABI, signer);

  let tx;
  if (params.isETHToToken) {
    tx = await amm.swapETHForToken(
      parseEther(params.minAmountOut),
      { value: parseEther(params.amountIn) }
    );
  } else {
    const tokenAddress = await amm.token();
    const token = new Contract(tokenAddress, ERC20_ABI, signer);

    const allowance = await token.allowance(await signer.getAddress(), params.ammAddress);
    const amountIn = parseEther(params.amountIn);

    if (allowance < amountIn) {
      const approveTx = await token.approve(params.ammAddress, amountIn);
      await approveTx.wait();
    }

    tx = await amm.swapTokenForETH(amountIn, parseEther(params.minAmountOut));
  }

  return await tx.wait();
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
