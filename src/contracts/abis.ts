export const MCFUN_FACTORY_ABI = [
  "function createToken(string memory name, string memory symbol, uint256 liquidityPercent) external payable returns (address tokenAddress, address ammAddress)",
  "function getTokenCount() external view returns (uint256)",
  "function getToken(uint256 index) external view returns (tuple(address tokenAddress, address ammAddress, string name, string symbol, address creator, uint256 timestamp, uint256 initialLiquidityETH, uint256 liquidityPercent))",
  "function tokenToAMM(address token) external view returns (address)",
  "function tokens(uint256 index) external view returns (address tokenAddress, address ammAddress, string name, string symbol, address creator, uint256 timestamp, uint256 initialLiquidityETH, uint256 liquidityPercent)",
  "event TokenLaunched(address indexed tokenAddress, address indexed ammAddress, string name, string symbol, address indexed creator, uint256 liquidityPercent, uint256 initialLiquidityETH)"
];

export const MCFUN_AMM_ABI = [
  "function addLiquidity(uint256 tokenAmount) external payable returns (uint256)",
  "function removeLiquidity(uint256 liquidityAmount) external returns (uint256 ethAmount, uint256 tokenAmount)",
  "function swapETHForToken(uint256 minTokenOut) external payable returns (uint256 tokenOut)",
  "function swapTokenForETH(uint256 tokenIn, uint256 minETHOut) external returns (uint256 ethOut)",
  "function getPrice() external view returns (uint256)",
  "function getTokenOut(uint256 ethIn) external view returns (uint256)",
  "function getETHOut(uint256 tokenIn) external view returns (uint256)",
  "function token() external view returns (address)",
  "function reserveToken() external view returns (uint256)",
  "function reserveETH() external view returns (uint256)",
  "function totalLiquidity() external view returns (uint256)",
  "function liquidity(address account) external view returns (uint256)",
  "event LiquidityAdded(address indexed provider, uint256 ethAmount, uint256 tokenAmount, uint256 liquidityMinted)",
  "event LiquidityRemoved(address indexed provider, uint256 ethAmount, uint256 tokenAmount, uint256 liquidityBurned)",
  "event Swap(address indexed user, uint256 ethIn, uint256 tokenIn, uint256 ethOut, uint256 tokenOut)"
];

export const ERC20_ABI = [
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address to, uint256 value) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 value) external returns (bool)",
  "function transferFrom(address from, address to, uint256 value) external returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];
