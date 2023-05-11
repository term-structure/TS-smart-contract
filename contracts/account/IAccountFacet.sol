// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IAccountFacet {
    /// @notice Error for register account which is already registered
    error AccountIsRegistered(address sender);
    /// @notice Error for register account with tsb token
    error InvalidBaseTokenAddr(address invalidTokenAddr);
    /// @notice Error for register account when exceed account number limit
    error AccountNumExceedLimit(uint32 registeredAccountId);

    /// @notice Emit when there is a new account registered
    /// @param accountAddr The user account address in layer1
    /// @param accountId The user account id in the L2 system
    /// @param tsPubX The x coordinate of the public key of the account
    /// @param tsPubY The y coordinate of the public key of the account
    /// @param tsAddr The address of the account in the L2 system
    event Register(address indexed accountAddr, uint32 accountId, uint256 tsPubX, uint256 tsPubY, bytes20 tsAddr);

    /// @notice Emit when there is a new deposit
    /// @param accountAddr The user account address in layer1
    /// @param accountId The user account id in the L2 system
    /// @param tokenId The token id of the deposit token
    /// @param amount The deposit amount
    event Deposit(address indexed accountAddr, uint32 accountId, uint16 tokenId, uint128 amount);

    /// @notice Emit when there is a new withdraw
    /// @param accountAddr The user account address in layer1
    /// @param accountId The user account id in the L2 system
    /// @param tokenId Layer2 id of withdraw token
    /// @param amount The withdraw amount
    event Withdraw(address indexed accountAddr, uint32 accountId, uint16 tokenId, uint128 amount);

    /// @notice Emit when there is a new force withdraw
    /// @param accountAddr The user account address in layer1
    /// @param accountId The user account id in the L2 system
    /// @param tokenId Layer2 id of force withdraw token
    event ForceWithdraw(address indexed accountAddr, uint32 accountId, uint16 tokenId);

    /// @notice Emitted when evacuation is activated
    /// @param evacuationBlock The block number when evacuation is activated
    event EvacuationActivated(uint256 indexed evacuationBlock);
}
