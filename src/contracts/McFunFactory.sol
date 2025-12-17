// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./McFunAMM.sol";

interface IMcFunAMM {
    function addLiquidity(uint256 tokenAmount) external payable returns (uint256);
}

contract McFunFactory {
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
            type(McFunToken).creationCode,
            abi.encode(name, symbol)
        );

        assembly {
            tokenAddress := create(0, add(tokenBytecode, 0x20), mload(tokenBytecode))
        }
        if (tokenAddress == address(0)) revert TokenCreationFailed();

        bytes memory ammBytecode = abi.encodePacked(
            type(McFunAMM).creationCode,
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

        IMcFunAMM(ammAddress).addLiquidity{value: msg.value}(liquidityTokens);

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

contract McFunToken {
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
        if (spender == address(0)) revert ZeroAddress();
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
