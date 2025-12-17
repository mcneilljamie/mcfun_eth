// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IJammAMM {
    function addLiquidity(uint256 tokenAmount) external payable returns (uint256);
}

contract JammFactory {
    error ReentrancyGuard();
    error InvalidETHAmount();
    error InvalidLiquidityPercent();
    error InvalidNameOrSymbol();
    error TokenCreationFailed();
    error AMMCreationFailed();

    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant MIN_LIQUIDITY_ETH = 0.1 ether;
    uint256 public constant MIN_LIQUIDITY_PERCENT = 50;
    uint256 public constant TOTAL_SUPPLY = 1_000_000 * 10**18;

    struct TokenInfo {
        address tokenAddress;
        address ammAddress;
        string name;
        string symbol;
        address creator;
        uint256 timestamp;
        uint256 initialLiquidityETH;
        uint256 liquidityPercent;
    }

    TokenInfo[] public tokens;
    mapping(address => address) public tokenToAMM;

    uint256 private locked = 1;

    modifier nonReentrant() {
        if (locked != 1) revert ReentrancyGuard();
        locked = 2;
        _;
        locked = 1;
    }

    event TokenLaunched(
        address indexed tokenAddress,
        address indexed ammAddress,
        string name,
        string symbol,
        address indexed creator,
        uint256 liquidityPercent,
        uint256 initialLiquidityETH
    );

    function createToken(
        string memory name,
        string memory symbol,
        uint256 liquidityPercent
    ) external payable nonReentrant returns (address tokenAddress, address ammAddress) {
        if (msg.value < MIN_LIQUIDITY_ETH) revert InvalidETHAmount();
        if (liquidityPercent < MIN_LIQUIDITY_PERCENT || liquidityPercent > 100) revert InvalidLiquidityPercent();
        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert InvalidNameOrSymbol();

        bytes memory tokenBytecode = abi.encodePacked(
            type(JammToken).creationCode,
            abi.encode(name, symbol)
        );

        assembly {
            tokenAddress := create(0, add(tokenBytecode, 0x20), mload(tokenBytecode))
        }
        if (tokenAddress == address(0)) revert TokenCreationFailed();

        bytes memory ammBytecode = abi.encodePacked(
            type(JammAMM).creationCode,
            abi.encode(tokenAddress)
        );

        assembly {
            ammAddress := create(0, add(ammBytecode, 0x20), mload(ammBytecode))
        }
        if (ammAddress == address(0)) revert AMMCreationFailed();

        uint256 liquidityTokens = (TOTAL_SUPPLY * liquidityPercent) / 100;
        uint256 creatorTokens = TOTAL_SUPPLY - liquidityTokens;

        // EFFECTS: Update state before external calls
        tokenToAMM[tokenAddress] = ammAddress;

        tokens.push(TokenInfo({
            tokenAddress: tokenAddress,
            ammAddress: ammAddress,
            name: name,
            symbol: symbol,
            creator: msg.sender,
            timestamp: block.timestamp,
            initialLiquidityETH: msg.value,
            liquidityPercent: liquidityPercent
        }));

        // INTERACTIONS: External calls after state updates
        IERC20(tokenAddress).transfer(msg.sender, creatorTokens);
        IERC20(tokenAddress).approve(ammAddress, liquidityTokens);

        IJammAMM(ammAddress).addLiquidity{value: msg.value}(liquidityTokens);

        uint256 lpTokens = IERC20(ammAddress).balanceOf(address(this));
        if (lpTokens > 0) {
            IERC20(ammAddress).transfer(DEAD_ADDRESS, lpTokens);
        }

        emit TokenLaunched(tokenAddress, ammAddress, name, symbol, msg.sender, liquidityPercent, msg.value);

        return (tokenAddress, ammAddress);
    }

    function getTokenCount() external view returns (uint256) {
        return tokens.length;
    }

    function getToken(uint256 index) external view returns (TokenInfo memory) {
        require(index < tokens.length, "Index out of bounds");
        return tokens[index];
    }
}

contract JammToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        totalSupply = 1_000_000 * 10**decimals;
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(balanceOf[from] >= value, "Insufficient balance");
        require(allowance[from][msg.sender] >= value, "Insufficient allowance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        allowance[from][msg.sender] -= value;
        emit Transfer(from, to, value);
        return true;
    }
}

contract JammAMM {
    address public token;
    address public constant feeRecipient = 0x227D5F29bAb4Cec30f511169886b86fAeF61C6bc;
    uint256 public constant FEE_PERCENT = 4;
    uint256 public constant FEE_DENOMINATOR = 1000;

    uint256 public reserveToken;
    uint256 public reserveETH;
    uint256 public totalLiquidity;

    mapping(address => uint256) public liquidity;

    event LiquidityAdded(address indexed provider, uint256 ethAmount, uint256 tokenAmount, uint256 liquidityMinted);
    event LiquidityRemoved(address indexed provider, uint256 ethAmount, uint256 tokenAmount, uint256 liquidityBurned);
    event Swap(address indexed user, uint256 ethIn, uint256 tokenIn, uint256 ethOut, uint256 tokenOut);

    constructor(address _token) {
        token = _token;
    }

    function balanceOf(address account) external view returns (uint256) {
        return liquidity[account];
    }

    function transfer(address to, uint256 value) external returns (bool) {
        require(liquidity[msg.sender] >= value, "Insufficient balance");
        liquidity[msg.sender] -= value;
        liquidity[to] += value;
        return true;
    }

    function addLiquidity(uint256 tokenAmount) external payable returns (uint256 liquidityMinted) {
        require(msg.value > 0 && tokenAmount > 0, "Invalid amounts");

        if (totalLiquidity == 0) {
            liquidityMinted = msg.value;
            reserveETH = msg.value;
            reserveToken = tokenAmount;
        } else {
            uint256 ethLiquidity = (msg.value * totalLiquidity) / reserveETH;
            uint256 tokenLiquidity = (tokenAmount * totalLiquidity) / reserveToken;
            liquidityMinted = ethLiquidity < tokenLiquidity ? ethLiquidity : tokenLiquidity;

            reserveETH += msg.value;
            reserveToken += tokenAmount;
        }

        IERC20(token).transferFrom(msg.sender, address(this), tokenAmount);

        liquidity[msg.sender] += liquidityMinted;
        totalLiquidity += liquidityMinted;

        emit LiquidityAdded(msg.sender, msg.value, tokenAmount, liquidityMinted);

        return liquidityMinted;
    }

    function removeLiquidity(uint256 liquidityAmount) external returns (uint256 ethAmount, uint256 tokenAmount) {
        require(liquidity[msg.sender] >= liquidityAmount, "Insufficient liquidity");

        ethAmount = (liquidityAmount * reserveETH) / totalLiquidity;
        tokenAmount = (liquidityAmount * reserveToken) / totalLiquidity;

        liquidity[msg.sender] -= liquidityAmount;
        totalLiquidity -= liquidityAmount;
        reserveETH -= ethAmount;
        reserveToken -= tokenAmount;

        IERC20(token).transfer(msg.sender, tokenAmount);
        payable(msg.sender).transfer(ethAmount);

        emit LiquidityRemoved(msg.sender, ethAmount, tokenAmount, liquidityAmount);

        return (ethAmount, tokenAmount);
    }

    function swapETHForToken(uint256 minTokenOut) external payable returns (uint256 tokenOut) {
        require(msg.value > 0, "Invalid ETH amount");

        uint256 fee = (msg.value * FEE_PERCENT) / FEE_DENOMINATOR;
        uint256 ethAfterFee = msg.value - fee;

        tokenOut = (ethAfterFee * reserveToken) / (reserveETH + ethAfterFee);
        require(tokenOut >= minTokenOut, "Slippage too high");
        require(tokenOut <= reserveToken, "Insufficient liquidity");

        reserveETH += ethAfterFee;
        reserveToken -= tokenOut;

        payable(feeRecipient).transfer(fee);
        IERC20(token).transfer(msg.sender, tokenOut);

        emit Swap(msg.sender, msg.value, 0, 0, tokenOut);

        return tokenOut;
    }

    function swapTokenForETH(uint256 tokenIn, uint256 minETHOut) external returns (uint256 ethOut) {
        require(tokenIn > 0, "Invalid token amount");
        IERC20(token).transferFrom(msg.sender, address(this), tokenIn);

        uint256 ethBeforeFee = (tokenIn * reserveETH) / (reserveToken + tokenIn);
        uint256 fee = (ethBeforeFee * FEE_PERCENT) / FEE_DENOMINATOR;
        ethOut = ethBeforeFee - fee;

        require(ethOut >= minETHOut, "Slippage too high");
        require(ethOut <= reserveETH, "Insufficient liquidity");

        reserveToken += tokenIn;
        reserveETH -= ethBeforeFee;

        payable(feeRecipient).transfer(fee);
        payable(msg.sender).transfer(ethOut);

        emit Swap(msg.sender, 0, tokenIn, ethOut, 0);

        return ethOut;
    }

    function getPrice() external view returns (uint256) {
        if (reserveToken == 0) return 0;
        return (reserveETH * 1e18) / reserveToken;
    }

    function getTokenOut(uint256 ethIn) external view returns (uint256) {
        if (ethIn == 0 || reserveETH == 0) return 0;
        uint256 ethAfterFee = ethIn - ((ethIn * FEE_PERCENT) / FEE_DENOMINATOR);
        return (ethAfterFee * reserveToken) / (reserveETH + ethAfterFee);
    }

    function getETHOut(uint256 tokenIn) external view returns (uint256) {
        if (tokenIn == 0 || reserveToken == 0) return 0;
        uint256 ethBeforeFee = (tokenIn * reserveETH) / (reserveToken + tokenIn);
        return ethBeforeFee - ((ethBeforeFee * FEE_PERCENT) / FEE_DENOMINATOR);
    }
}
