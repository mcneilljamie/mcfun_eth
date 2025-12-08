// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title McFunAMM
 * @notice Automated Market Maker with PERMANENT liquidity lock
 * @dev CRITICAL: First MINIMUM_LIQUIDITY (1000 wei) is PERMANENTLY BURNED to address(0)
 *      This ensures every token launched through this platform has liquidity that can NEVER be removed
 */
contract McFunAMM {
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

    function addLiquidity(uint256 tokenAmount) external payable nonReentrant returns (uint256 liquidityMinted) {
        if (msg.value == 0 || tokenAmount == 0) revert ZeroAmount();

        if (totalLiquidity == 0) {
            liquidityMinted = msg.value;
            if (liquidityMinted <= MINIMUM_LIQUIDITY) revert InvalidLiquidityAmount();

            reserveETH = msg.value;
            reserveToken = tokenAmount;

            // PERMANENT LIQUIDITY LOCK: First MINIMUM_LIQUIDITY is burned to address(0)
            // This ensures liquidity can NEVER be fully removed from the pool
            // This is a critical security feature for all tokens on this platform
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

        if (!IERC20(token).transferFrom(msg.sender, address(this), tokenIn)) revert TransferFailed();

        uint256 ethBeforeFee = (tokenIn * reserveETH) / (reserveToken + tokenIn);
        uint256 fee = (ethBeforeFee * FEE_PERCENT) / FEE_DENOMINATOR;
        ethOut = ethBeforeFee - fee;

        if (ethOut < minETHOut) revert SlippageExceeded();
        if (ethOut > reserveETH) revert InsufficientLiquidity();

        reserveToken += tokenIn;
        reserveETH -= ethBeforeFee;

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
