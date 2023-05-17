// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IAccountFacet {
    /// @notice Error for register account which is already registered
    error AccountIsRegistered(address sender);
    /// @notice Error for register account with tsb token
    error InvalidBaseTokenAddr(address invalidTokenAddr);
    /// @notice Error for register account when exceed account number limit
    error AccountNumExceedLimit(uint32 registeredAccountId);

    function register(uint256 tsPubKeyX, uint256 tsPubKeyY, address tokenAddr, uint128 amount) external payable;

    function deposit(address to, address tokenAddr, uint128 amount) external payable;

    function withdraw(address tokenAddr, uint128 amount) external;

    function forceWithdraw(address tokenAddr) external;

    function getAccountAddr(uint32 accountId) external view returns (address);

    function getAccountId(address accountAddr) external view returns (uint32);

    function getAccountNum() external view returns (uint32);
}
