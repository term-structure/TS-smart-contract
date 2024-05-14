// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

//! mainnet-audit
// delegated actions mask
uint256 constant DELEGATE_WITHDRAW_MASK = 1 << 255;
uint256 constant DELEGATE_REMOVE_COLLATERAL_MASK = 1 << 254;
uint256 constant DELEGATE_REPAY_MASK = 1 << 253;
uint256 constant DELEGATE_ROLL_TO_AAVE_MASK = 1 << 252;
uint256 constant DELEGATE_ROLL_BORROW_MASK = 1 << 251;
uint256 constant DELEGATE_FORCE_CANCEL_ROLL_BORROW_MASK = 1 << 250;
uint256 constant DELEGATE_REDEEM_MASK = 1 << 249;

library Delegate {
    /// @notice Check if the action is delegated
    /// @param delegatedActions The delegated actions
    /// @param actionMask The mask of the action to check
    function isDelegated(uint256 delegatedActions, uint256 actionMask) internal pure returns (bool) {
        return delegatedActions & actionMask != 0;
    }
}
