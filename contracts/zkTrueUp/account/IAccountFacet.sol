// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Term Structure Account Facet Interface
 * @author Term Structure Labs
 */
interface IAccountFacet {
    /// @notice Error for register account which is already registered
    error AccountIsRegistered(address sender);
    /// @notice Error for register account when exceed account number limit
    error AccountNumExceedLimit(uint32 registeredAccountId);
    /// @notice Error for register account when the public key is invalid
    error InvalidTsPublicKey(uint256 tsPubKeyX, uint256 tsPubKeyY);

    /// @notice Emit when the delegatee is set
    event SetDelegatee(address indexed delegator, address indexed delegatee, uint256 delegatedActions);

    /// @notice Register account by deposit Ether or ERC20 to ZkTrueUp
    /// @param tsPubKeyX The X coordinate of the public key of the L2 account
    /// @param tsPubKeyY The Y coordinate of the public key of the L2 account
    /// @param token The token to be deposited
    /// @param amount The amount of the token to be deposited
    function register(uint256 tsPubKeyX, uint256 tsPubKeyY, IERC20 token, uint128 amount) external payable;

    /// @notice Deposit Ether or ERC20 to ZkTrueUp
    /// @param to The address of the L2 account to be deposited
    /// @param token The token to be deposited
    /// @param amount The amount of the token to be deposited
    function deposit(address to, IERC20 token, uint128 amount) external payable;

    /// @notice Withdraw Ether or ERC20 from ZkTrueUp
    /// @param accountAddr The address of the L2 account to be withdrawn
    /// @param token The token to be withdrawn
    /// @param amount The amount of the token to be withdrawn
    function withdraw(address accountAddr, IERC20 token, uint256 amount) external;

    /// @notice Withdraw Ether or ERC20 from ZkTrueUp with permit
    /// @param accountAddr The address of the L2 account to be withdrawn
    /// @param token The token to be withdrawn
    /// @param amount The amount of the token to be withdrawn
    /// @param deadline The deadline of the permit
    /// @param v v The recovery id of the signature
    /// @param r The r of the permit signature
    /// @param s The s of the permit signature
    function withdrawWithPermit(
        address accountAddr,
        IERC20 token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Force withdraw Ether or ERC20 from ZkTrueUp
    /// @notice When the L2 system is down or user's asset is censored, user can do forceWithdraw to withdraw asset from ZkTrueUp
    /// @notice If the forceWithdraw request is not processed before the expirationBlock, user can do activateEvacuation to activate the evacuation
    /// @param token The token to be withdrawn
    function forceWithdraw(IERC20 token) external;

    /// @notice Set the delegatee of the account
    /// @dev Refer to each action mask in the library for different delegated actions (path: ../libraries/Delegate.sol)
    /// @dev (i.e. use `DELEGATE_WITHDRAW_MASK` to delegate the withdraw action)
    /// @param delegatee The address of the delegatee
    /// @param delegatedActions The delegated actions, each action has a unique bit in the delegatedActions
    function setDelegatee(address delegatee, uint256 delegatedActions) external;

    /// @notice Get the account L1 address by account L2 id
    /// @param accountId The account L2 id
    /// @return accountAddr The account L1 address
    function getAccountAddr(uint32 accountId) external view returns (address accountAddr);

    /// @notice Get the account id by account L1 address
    /// @param accountAddr The account L1 address
    /// @return accountId The account L2 id
    function getAccountId(address accountAddr) external view returns (uint32 accountId);

    /// @notice Get the number of registered accounts
    /// @return accountNum The number of registered accounts
    function getAccountNum() external view returns (uint32 accountNum);

    /// @notice Return the permit nonce of the account
    /// @dev The nonce is used to prevent signature replay attack
    /// @param accountAddr The address of the account
    /// @return nonce The permit nonce of the account
    function getPermitNonce(address accountAddr) external view returns (uint256);

    /// @notice Return the isDelegated status of the account
    /// @dev Refer to each action mask in the library for different delegated actions (path: ../libraries/Delegate.sol)
    /// @dev (i.e. use `DELEGATE_WITHDRAW_MASK` to check if the withdraw action is delegated)
    /// @param delegator The address of the delegator
    /// @param delegatee The address of the delegatee
    /// @param actionMask The mask of the action to check if it is delegated
    /// @return isDelegated The action is delegated or not
    function getIsDelegated(address delegator, address delegatee, uint256 actionMask) external view returns (bool);

    /// @notice Return the delegated actions of the account
    /// @param delegator The address of the delegator
    /// @param delegatee The address of the delegatee
    /// @return delegatedActions The delegated actions of the account
    function getDelegatedActions(address delegator, address delegatee) external view returns (uint256);
}
