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
    error TransferFailed();

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
        if (!IERC20(tokenAddress).transfer(msg.sender, creatorTokens)) revert TransferFailed();
        if (!IERC20(tokenAddress).approve(ammAddress, liquidityTokens)) revert TransferFailed();

        IJammAMM(ammAddress).addLiquidity{value: msg.value}(liquidityTokens);

        uint256 lpTokens = IERC20(ammAddress).balanceOf(address(this));
        if (lpTokens > 0) {
            if (!IERC20(ammAddress).transfer(DEAD_ADDRESS, lpTokens)) revert TransferFailed();
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
    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();

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
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[msg.sender] < value) revert InsufficientBalance();

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
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < value) revert InsufficientBalance();
        if (allowance[from][msg.sender] < value) revert InsufficientAllowance();

        balanceOf[from] -= value;
        balanceOf[to] += value;
        allowance[from][msg.sender] -= value;
        emit Transfer(from, to, value);
        return true;
    }
}

contract JammAMM {
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientLiquidity();
    error SlippageExceeded();
    error TransferFailed();
    error ReentrancyDetected();
    error InvalidLiquidityAmount();

    address public token;
    address public constant feeRecipient = 0x227D5F29bAb4Cec30f511169886b86fAeF61C6bc;
    uint256 public constant FEE_PERCENT = 4;
    uint256 public constant FEE_DENOMINATOR = 1000;
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    uint256 public reserveToken;
    uint256 public reserveETH;
    uint256 public totalLiquidity;

    mapping(address => uint256) public liquidity;

    uint256 private locked = 1;

    modifier nonReentrant() {
        if (locked != 1) revert ReentrancyDetected();
        locked = 2;
        _;
        locked = 1;
    }

    event LiquidityAdded(address indexed provider, uint256 ethAmount, uint256 tokenAmount, uint256 liquidityMinted);
    event LiquidityRemoved(address indexed provider, uint256 ethAmount, uint256 tokenAmount, uint256 liquidityBurned);
    event Swap(address indexed user, uint256 ethIn, uint256 tokenIn, uint256 ethOut, uint256 tokenOut);

    constructor(address _token) {
        if (_token == address(0)) revert ZeroAddress();
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

    function addLiquidity(uint256 tokenAmount) external payable nonReentrant returns (uint256 liquidityMinted) {
        if (msg.value == 0 || tokenAmount == 0) revert ZeroAmount();

        if (totalLiquidity == 0) {
            liquidityMinted = msg.value;
            if (liquidityMinted <= MINIMUM_LIQUIDITY) revert InvalidLiquidityAmount();

            reserveETH = msg.value;
            reserveToken = tokenAmount;

            liquidity[address(0)] = MINIMUM_LIQUIDITY;
            totalLiquidity = MINIMUM_LIQUIDITY;
            liquidityMinted -= MINIMUM_LIQUIDITY;
        } else {
            uint256 ethLiquidity = (msg.value * totalLiquidity) / reserveETH;
            uint256 tokenLiquidity = (tokenAmount * totalLiquidity) / reserveToken;
            liquidityMinted = ethLiquidity < tokenLiquidity ? ethLiquidity : tokenLiquidity;

            if (liquidityMinted == 0) revert InvalidLiquidityAmount();

            reserveETH += msg.value;
            reserveToken += tokenAmount;
        }

        if (!IERC20(token).transferFrom(msg.sender, address(this), tokenAmount)) revert TransferFailed();

        liquidity[msg.sender] += liquidityMinted;
        totalLiquidity += liquidityMinted;

        emit LiquidityAdded(msg.sender, msg.value, tokenAmount, liquidityMinted);

        return liquidityMinted;
    }

    function removeLiquidity(uint256 liquidityAmount) external nonReentrant returns (uint256 ethAmount, uint256 tokenAmount) {
        if (liquidityAmount == 0) revert ZeroAmount();
        if (liquidity[msg.sender] < liquidityAmount) revert InsufficientLiquidity();
        if (totalLiquidity == 0) revert InsufficientLiquidity();

        ethAmount = (liquidityAmount * reserveETH) / totalLiquidity;
        tokenAmount = (liquidityAmount * reserveToken) / totalLiquidity;

        if (ethAmount == 0 || tokenAmount == 0) revert InvalidLiquidityAmount();

        liquidity[msg.sender] -= liquidityAmount;
        totalLiquidity -= liquidityAmount;
        reserveETH -= ethAmount;
        reserveToken -= tokenAmount;

        if (!IERC20(token).transfer(msg.sender, tokenAmount)) revert TransferFailed();

        (bool success, ) = payable(msg.sender).call{value: ethAmount}("");
        if (!success) revert TransferFailed();

        emit LiquidityRemoved(msg.sender, ethAmount, tokenAmount, liquidityAmount);

        return (ethAmount, tokenAmount);
    }

    function swapETHForToken(uint256 minTokenOut) external payable nonReentrant returns (uint256 tokenOut) {
        if (msg.value == 0) revert ZeroAmount();
        if (reserveToken == 0 || reserveETH == 0) revert InsufficientLiquidity();

        uint256 fee = (msg.value * FEE_PERCENT) / FEE_DENOMINATOR;
        uint256 ethAfterFee = msg.value - fee;

        tokenOut = (ethAfterFee * reserveToken) / (reserveETH + ethAfterFee);
        if (tokenOut < minTokenOut) revert SlippageExceeded();
        if (tokenOut > reserveToken) revert InsufficientLiquidity();

        reserveETH += ethAfterFee;
        reserveToken -= tokenOut;

        (bool feeSuccess, ) = payable(feeRecipient).call{value: fee}("");
        if (!feeSuccess) revert TransferFailed();

        if (!IERC20(token).transfer(msg.sender, tokenOut)) revert TransferFailed();

        emit Swap(msg.sender, msg.value, 0, 0, tokenOut);

        return tokenOut;
    }

    function swapTokenForETH(uint256 tokenIn, uint256 minETHOut) external nonReentrant returns (uint256 ethOut) {
        if (tokenIn == 0) revert ZeroAmount();
        if (reserveToken == 0 || reserveETH == 0) revert InsufficientLiquidity();

        uint256 ethBeforeFee = (tokenIn * reserveETH) / (reserveToken + tokenIn);
        uint256 fee = (ethBeforeFee * FEE_PERCENT) / FEE_DENOMINATOR;
        ethOut = ethBeforeFee - fee;

        if (ethOut < minETHOut) revert SlippageExceeded();
        if (ethOut > reserveETH) revert InsufficientLiquidity();

        reserveToken += tokenIn;
        reserveETH -= ethBeforeFee;

        if (!IERC20(token).transferFrom(msg.sender, address(this), tokenIn)) revert TransferFailed();

        (bool feeSuccess, ) = payable(feeRecipient).call{value: fee}("");
        if (!feeSuccess) revert TransferFailed();

        (bool success, ) = payable(msg.sender).call{value: ethOut}("");
        if (!success) revert TransferFailed();

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
