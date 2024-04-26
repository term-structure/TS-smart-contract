/* ============ The type hash of sign typed data v4 for permit functions ============ */

// withdraw function type hash
bytes32 constant WITHDRAW_TYPEHASH = keccak256("Withdraw(address token,uint256 amount,uint256 nonce,uint256 deadline)");

// redeem function type hash
bytes32 constant REDEEM_TYPEHASH = keccak256(
    "Redeem(address tsbToken,uint128 amount,bool redeemAndDeposit,uint256 nonce,uint256 deadline)"
);

// Remove collateral function type hash
bytes32 constant REMOVE_COLLATERAL_TYPEHASH = keccak256(
    "RemoveCollateral(bytes12 loanId,uint128 amount,uint256 nonce,uint256 deadline)"
);

// Repay function type hash
bytes32 constant REPAY_TYPEHASH = keccak256(
    "Repay(bytes12 loanId,uint128 collateralAmt,uint128 debtAmt,bool repayAndDeposit,uint256 nonce,uint256 deadline)"
);

// Borrow function type hash
bytes32 constant ROLL_BORROW_TYPEHASH = keccak256(
    "RollBorrow(bytes12 loanId,uint32 expiredTime,uint32 maxAnnualPercentageRate,uint128 maxCollateralAmt,uint128 maxBorrowAmt,address tsbTokenAddr,uint256 nonce,uint256 deadline)"
);

// Force cancel roll borrow function type hash
bytes32 constant FORCE_CANCEL_ROLL_BORROW_TYPEHASH = keccak256(
    "ForceCancelRollBorrow(bytes12 loanId,uint256 nonce,uint256 deadline)"
);

// Roll to Aave function type hash
bytes32 constant ROLL_TO_AAVE_TYPEHASH = keccak256(
    "RollToAave(bytes12 loanId,uint128 collateralAmt,uint128 debtAmt,uint256 nonce,uint256 deadline)"
);
