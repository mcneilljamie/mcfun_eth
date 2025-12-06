// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
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

        require(IERC20(token).transferFrom(msg.sender, address(this), tokenAmount), "Token transfer failed");

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

        require(IERC20(token).transfer(msg.sender, tokenAmount), "Token transfer failed");
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
        require(IERC20(token).transfer(msg.sender, tokenOut), "Token transfer failed");

        emit Swap(msg.sender, msg.value, 0, 0, tokenOut);

        return tokenOut;
    }

    function swapTokenForETH(uint256 tokenIn, uint256 minETHOut) external returns (uint256 ethOut) {
        require(tokenIn > 0, "Invalid token amount");
        require(IERC20(token).transferFrom(msg.sender, address(this), tokenIn), "Token transfer failed");

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
