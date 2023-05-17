// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {AccountStorage} from "./AccountStorage.sol";
import {IAccountFacet} from "./IAccountFacet.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {AccountLib} from "./AccountLib.sol";
import {TsbLib} from "../tsb/TsbLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {Config} from "../libraries/Config.sol";

contract AccountFacet is IAccountFacet, ReentrancyGuard {
    /// @notice Register account by deposit Ether or ERC20 to ZkTrueUp
    /// @dev The account is registered by depositing Ether or ERC20 to ZkTrueUp
    /// @param tsPubKeyX The X coordinate of the public key of the L2 account
    /// @param tsPubKeyY The Y coordinate of the public key of the L2 account
    /// @param tokenAddr The address of the token to be deposited
    /// @param amount The amount of the token to be deposited
    function register(uint256 tsPubKeyX, uint256 tsPubKeyY, address tokenAddr, uint128 amount) external payable {
        RollupLib.requireActive();
        uint32 accountId = AccountLib.getAccountId(msg.sender);
        if (accountId != 0) revert AccountIsRegistered(msg.sender);
        (, AssetConfig memory assetConfig) = TokenLib.getValidToken(tokenAddr);
        if (assetConfig.isTsbToken) revert InvalidBaseTokenAddr(tokenAddr);
        accountId = _register(msg.sender, tsPubKeyX, tsPubKeyY);
        _deposit(msg.sender, msg.sender, accountId, tokenAddr, amount);
    }

    /// @notice Deposit Ether or ERC20 to ZkTrueUp
    /// @dev Only registered accounts can deposit
    /// @param to The address of the L2 account to be deposited
    /// @param tokenAddr The address of the token to be deposited
    /// @param amount The amount of the token to be deposited
    function deposit(address to, address tokenAddr, uint128 amount) external payable {
        RollupLib.requireActive();
        uint32 accountId = AccountLib.getValidAccount(to);
        _deposit(msg.sender, to, accountId, tokenAddr, amount);
    }

    /// @notice Withdraw Ether or ERC20 from ZkTrueUp
    /// @dev Only registered accounts can withdraw
    /// @dev The token cannot be TSB token
    /// @param tokenAddr The address of the token to be withdrawn
    /// @param amount The amount of the token to be withdrawn
    //! virtual for test
    function withdraw(address tokenAddr, uint128 amount) external virtual nonReentrant {
        uint32 accountId = AccountLib.getValidAccount(msg.sender);
        (uint16 tokenId, AssetConfig memory assetConfig) = TokenLib.getValidToken(tokenAddr);
        AccountLib.updateWithdrawRecord(msg.sender, accountId, tokenId, amount);
        assetConfig.isTsbToken
            ? TsbLib.mintTsbToken(tokenAddr, msg.sender, amount)
            : TokenLib.transfer(tokenAddr, payable(msg.sender), amount);
    }

    /// @notice Force withdraw Ether or ERC20 from ZkTrueUp
    /// @notice When the L2 system is down or user's asset is censored, user can do forceWithdraw to withdraw asset from ZkTrueUp
    /// @notice If the forceWithdraw request is not processed before the expirationBlock, user can do activateEvacuation to activate the evacuation
    /// @param tokenAddr The address of the token to be withdrawn
    function forceWithdraw(address tokenAddr) external {
        uint32 accountId = AccountLib.getValidAccount(msg.sender);
        (uint16 tokenId, ) = TokenLib.getValidToken(tokenAddr);
        AccountLib.addForceWithdrawReq(msg.sender, accountId, tokenId);
    }

    function getAccountAddr(uint32 accountId) external view returns (address accountAddr) {
        return AccountLib.getAccountAddr(accountId);
    }

    function getAccountId(address accountAddr) external view returns (uint32 accountId) {
        return AccountLib.getAccountId(accountAddr);
    }

    function getAccountNum() external view returns (uint32 accountNum) {
        return AccountLib.getAccountNum();
    }

    /// @notice Internal register function
    /// @param sender The address of sender
    /// @param tsPubKeyX The x coordinate of the public key of the token sender
    /// @param tsPubKeyY The y coordinate of the public key of the token sender
    /// @return registeredAccountId The registered L2 account Id
    function _register(address sender, uint256 tsPubKeyX, uint256 tsPubKeyY) internal returns (uint32) {
        uint32 accountId = AccountLib.getAccountNum();
        if (accountId >= Config.MAX_AMOUNT_OF_REGISTERED_ACCOUNT) revert AccountNumExceedLimit(accountId);
        AccountStorage.Layout storage asl = AccountStorage.layout();
        asl.accountIds[sender] = accountId;
        asl.accountAddresses[accountId] = sender;
        asl.accountNum++;
        AccountLib.addRegisterReq(sender, accountId, tsPubKeyX, tsPubKeyY);
        return accountId;
    }

    /// @notice Internal deposit function for register and deposit
    /// @param depositor The address that deposit the L1 token
    /// @param to The address credtied with the deposit
    /// @param accountId user account id in layer2
    /// @param tokenAddr The address of the token to be deposited
    /// @param amount The amount of the token
    function _deposit(address depositor, address to, uint32 accountId, address tokenAddr, uint128 amount) internal {
        (uint16 tokenId, AssetConfig memory assetConfig) = TokenLib.getValidToken(tokenAddr);
        TokenLib.validDepositAmt(amount, assetConfig);
        assetConfig.isTsbToken
            ? TsbLib.burnTsbToken(tokenAddr, to, amount)
            : TokenLib.transferFrom(tokenAddr, depositor, amount, msg.value);

        AccountLib.addDepositReq(to, accountId, tokenId, assetConfig.decimals, amount);
    }
}
