// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract TokenLocker {
    struct Lock {
        address owner;
        address tokenAddress;
        uint256 amount;
        uint256 unlockTime;
        bool withdrawn;
    }

    mapping(uint256 => Lock) public locks;
    uint256 public nextLockId;

    event TokensLocked(
        uint256 indexed lockId,
        address indexed owner,
        address indexed tokenAddress,
        uint256 amount,
        uint256 unlockTime
    );

    event TokensUnlocked(
        uint256 indexed lockId,
        address indexed owner,
        address indexed tokenAddress,
        uint256 amount
    );

    function lockTokens(
        address tokenAddress,
        uint256 amount,
        uint256 durationDays
    ) external returns (uint256) {
        require(tokenAddress != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        require(durationDays > 0, "Duration must be at least 1 day");

        IERC20 token = IERC20(tokenAddress);
        require(
            token.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );

        uint256 lockId = nextLockId++;
        uint256 unlockTime = block.timestamp + (durationDays * 1 days);

        locks[lockId] = Lock({
            owner: msg.sender,
            tokenAddress: tokenAddress,
            amount: amount,
            unlockTime: unlockTime,
            withdrawn: false
        });

        emit TokensLocked(lockId, msg.sender, tokenAddress, amount, unlockTime);

        return lockId;
    }

    function unlockTokens(uint256 lockId) external {
        Lock storage lock = locks[lockId];

        require(lock.owner == msg.sender, "Not lock owner");
        require(!lock.withdrawn, "Already withdrawn");
        require(block.timestamp >= lock.unlockTime, "Lock period not expired");

        lock.withdrawn = true;

        IERC20 token = IERC20(lock.tokenAddress);
        require(
            token.transfer(msg.sender, lock.amount),
            "Transfer failed"
        );

        emit TokensUnlocked(lockId, msg.sender, lock.tokenAddress, lock.amount);
    }

    function getLock(uint256 lockId) external view returns (
        address owner,
        address tokenAddress,
        uint256 amount,
        uint256 unlockTime,
        bool withdrawn
    ) {
        Lock memory lock = locks[lockId];
        return (
            lock.owner,
            lock.tokenAddress,
            lock.amount,
            lock.unlockTime,
            lock.withdrawn
        );
    }

    function getTimeUntilUnlock(uint256 lockId) external view returns (uint256) {
        Lock memory lock = locks[lockId];
        if (block.timestamp >= lock.unlockTime) {
            return 0;
        }
        return lock.unlockTime - block.timestamp;
    }
}
