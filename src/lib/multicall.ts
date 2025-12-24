import { Contract, Provider, Interface } from 'ethers';

interface Call {
  target: string;
  callData: string;
}

interface Result {
  success: boolean;
  returnData: string;
}

export async function multicall(
  provider: Provider,
  calls: Call[]
): Promise<Result[]> {
  if (calls.length === 0) return [];

  // Use Promise.allSettled to batch all calls while handling individual failures gracefully
  const promises = calls.map(async (call) => {
    try {
      const result = await provider.call({
        to: call.target,
        data: call.callData,
      });
      return { success: true, returnData: result };
    } catch (error) {
      console.error(`Multicall failed for ${call.target}:`, error);
      return { success: false, returnData: '0x' };
    }
  });

  const results = await Promise.allSettled(promises);

  return results.map((result) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return { success: false, returnData: '0x' };
    }
  });
}

export async function getMultipleReserves(
  provider: Provider,
  ammAddresses: string[]
): Promise<Map<string, { reserveETH: string; reserveToken: string } | null>> {
  const ammInterface = new Interface([
    'function getReserves() view returns (uint112 reserveETH, uint112 reserveToken)',
  ]);

  const calls: Call[] = ammAddresses.map((address) => ({
    target: address,
    callData: ammInterface.encodeFunctionData('getReserves', []),
  }));

  const results = await multicall(provider, calls);
  const reservesMap = new Map<string, { reserveETH: string; reserveToken: string } | null>();

  results.forEach((result, index) => {
    const ammAddress = ammAddresses[index];

    if (result.success && result.returnData !== '0x') {
      try {
        const decoded = ammInterface.decodeFunctionResult('getReserves', result.returnData);
        const reserveETH = decoded[0].toString();
        const reserveToken = decoded[1].toString();

        // Convert from wei to ether
        reservesMap.set(ammAddress, {
          reserveETH: (Number(reserveETH) / 1e18).toString(),
          reserveToken: (Number(reserveToken) / 1e18).toString(),
        });
      } catch (error) {
        console.error(`Failed to decode reserves for ${ammAddress}:`, error);
        reservesMap.set(ammAddress, null);
      }
    } else {
      reservesMap.set(ammAddress, null);
    }
  });

  return reservesMap;
}
