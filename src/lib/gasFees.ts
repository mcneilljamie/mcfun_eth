interface GasOracleResponse {
  status: string;
  message: string;
  result: {
    LastBlock: string;
    SafeGasPrice: string;
    ProposeGasPrice: string;
    FastGasPrice: string;
    suggestBaseFee: string;
    gasUsedRatio: string;
  };
}

export interface GasFees {
  safe: number;
  standard: number;
  fast: number;
  baseFee: number;
}

export async function fetchGasFees(): Promise<GasFees | null> {
  const apiKey = import.meta.env.VITE_ETHERSCAN_API_KEY;

  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${apiKey}`
    );

    const data: GasOracleResponse = await response.json();

    if (data.status === '1' && data.result) {
      return {
        safe: parseFloat(data.result.SafeGasPrice),
        standard: parseFloat(data.result.ProposeGasPrice),
        fast: parseFloat(data.result.FastGasPrice),
        baseFee: parseFloat(data.result.suggestBaseFee),
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to fetch gas fees:', error);
    return null;
  }
}
