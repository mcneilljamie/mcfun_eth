# Token Lock Validation - Improved Error Handling

## Summary

Enhanced the token locking feature to properly reject non-McFun tokens with clear error messages at multiple levels.

## What Was Improved

### 1. Smart Contract (Already Had Validation)
**File:** `src/contracts/TokenLocker.sol:59-60`

The contract already validates that only McFun tokens can be locked:
```solidity
// Verify token was created through McFun factory
address ammAddress = IMcFunFactory(mcFunFactory).tokenToAMM(tokenAddress);
if (ammAddress == address(0)) revert NotMcFunToken();
```

### 2. Contract ABI (Updated)
**File:** `src/contracts/abis.ts`

Added the custom error to the ABI so the frontend can properly decode it:
```typescript
export const TOKEN_LOCKER_ABI = [
  // ... other functions
  "error NotMcFunToken()"
];
```

### 3. Frontend Validation (Already Existed, Improved Error Handling)
**File:** `src/pages/Lock.tsx`

#### Pre-transaction Validation (Lines 265-275)
```typescript
// Check if it's a McFun token BEFORE allowing user to proceed
const factoryContract = new ethers.Contract(factoryAddress, MCFUN_FACTORY_ABI, provider);
const ammAddress = await factoryContract.tokenToAMM(tokenAddress);
const isMcFunToken = ammAddress !== ethers.ZeroAddress;

if (!isMcFunToken) {
  setTokenInfo(null);
  setTokenValidationError(t('lock.errors.notMcFunToken'));
  return;
}
```

#### Button Disabled State (Line 977)
```typescript
disabled={isLocking || !tokenInfo || !tokenInfo.isMcFunToken || !amount || !duration}
```
The button is disabled if the token is not a McFun token.

#### Enhanced Error Handling (Lines 421-440)
```typescript
} catch (err: any) {
  console.error('Lock failed:', err);

  let errorMessage = t('lock.errors.lockFailed');

  // Detect NotMcFunToken error from contract
  if (err.message?.includes('NotMcFunToken') ||
      err.data?.message?.includes('NotMcFunToken') ||
      err.error?.message?.includes('NotMcFunToken')) {
    errorMessage = t('lock.errors.notMcFunToken');
  } else if (err.message?.includes('user rejected') ||
             err.message?.includes('User denied')) {
    errorMessage = t('lock.errors.userRejected');
  } else if (err.message?.includes('insufficient')) {
    errorMessage = t('lock.errors.insufficientBalance');
  }

  onShowToast({
    message: errorMessage,
    type: 'error',
  });
}
```

### 4. Translation Updates
**File:** `src/i18n/locales/en.json`

Added clear, user-friendly error messages:
```json
"errors": {
  "notMcFunToken": "This token was not launched on McFun. Only tokens launched on McFun can be locked on this platform.",
  "userRejected": "Transaction was rejected by user",
  "lockFailed": "Failed to lock tokens",
  "insufficientBalance": "Insufficient token balance"
}
```

## User Experience Flow

### Scenario 1: User Enters Non-McFun Token Address
1. User pastes a random ERC-20 token address
2. Frontend checks with factory contract
3. **Error displayed immediately:** Red alert box appears with clear message
4. Token info doesn't load
5. Lock button remains disabled

### Scenario 2: User Somehow Bypasses Frontend (e.g., direct contract call)
1. User tries to call contract directly
2. Smart contract checks `tokenToAMM()` mapping
3. **Transaction reverts with `NotMcFunToken()` error**
4. No tokens are locked
5. User only loses gas for the failed transaction

### Scenario 3: User Has Valid McFun Token
1. User enters McFun token address
2. ✓ Token info loads successfully
3. ✓ Shows token name, symbol, balance
4. ✓ Lock button enabled
5. ✓ User can proceed with locking

## Security Benefits

1. **Contract-Level Protection**: Even if frontend is bypassed, contract rejects invalid tokens
2. **No Wasted Gas**: Frontend validation prevents users from wasting gas on doomed transactions
3. **Clear Error Messages**: Users understand exactly why their token can't be locked
4. **No False Positives**: Only tokens created through McFun Factory are allowed

## Test Cases

### Valid McFun Token
```
Input: 0x02352ccd8896861ab9c5039eda9c91a4d37dc587 (AWXAW4F)
Result: ✓ Token loads, lock button enabled
```

### Random ERC-20 Token (e.g., USDC)
```
Input: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
Result: ✗ Error: "This token was not launched on McFun..."
```

### Non-existent Address
```
Input: 0x0000000000000000000000000000000000000001
Result: ✗ Error: "Invalid token address or failed to load token information"
```

### Invalid Address Format
```
Input: "not-an-address"
Result: ✗ No validation triggered (ethers.isAddress returns false)
```

## Technical Implementation Details

### How McFun Token Detection Works

The McFunFactory contract maintains a mapping:
```solidity
mapping(address => address) public tokenToAMM;
```

When a token is launched through McFun:
- Token address → AMM address (non-zero)

When a token is NOT launched through McFun:
- Token address → 0x0000000000000000000000000000000000000000

The locker checks:
```solidity
address ammAddress = IMcFunFactory(mcFunFactory).tokenToAMM(tokenAddress);
if (ammAddress == address(0)) revert NotMcFunToken();
```

## Conclusion

The token locking feature now has robust, multi-layered validation that ensures only McFun tokens can be locked:

1. ✓ **Frontend validation** - Immediate feedback
2. ✓ **Contract validation** - Ultimate security
3. ✓ **Clear error messages** - Great UX
4. ✓ **Disabled UI states** - Prevents invalid actions

No non-McFun tokens can slip through!
