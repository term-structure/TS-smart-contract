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
    /// @notice Error for account address is not the msg.sender
    error AccountAddrIsNotSender(address accountAddr, address sender);
    /// @notice Error for register account when exceed account number limit
    error AccountNumExceedLimit(uint32 registeredAccountId);
    /// @notice Error for register account when the public key is invalid
    error InvalidTsPublicKey(uint256 tsPubKeyX, uint256 tsPubKeyY);

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
    /// @param token The token to be withdrawn
    /// @param amount The amount of the token to be withdrawn
    /// @param accountId The L2 account id
    function withdraw(IERC20 token, uint256 amount, uint32 accountId) external;

    /// @notice Force withdraw Ether or ERC20 from ZkTrueUp
    /// @notice When the L2 system is down or user's asset is censored, user can do forceWithdraw to withdraw asset from ZkTrueUp
    /// @notice If the forceWithdraw request is not processed before the expirationBlock, user can do activateEvacuation to activate the evacuation
    /// @param token The token to be withdrawn
    function forceWithdraw(IERC20 token) external;

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
}
