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
import {Utils} from "../libraries/Utils.sol";

contract AccountFacet is IAccountFacet, ReentrancyGuard {
    /**
     * @inheritdoc IAccountFacet
     * @dev The account is registered by depositing Ether or ERC20 to ZkTrueUp
     */
    function register(uint256 tsPubKeyX, uint256 tsPubKeyY, address tokenAddr, uint128 amount) external payable {
        RollupLib.requireActive();
        AccountLib.requireNotRegistered(msg.sender);
        TokenLib.requireBaseToken(tokenAddr);
        uint32 accountId = _register(msg.sender, tsPubKeyX, tsPubKeyY);
        _deposit(msg.sender, msg.sender, accountId, tokenAddr, amount);
    }

    /**
     * @inheritdoc IAccountFacet
     * @dev Only registered accounts can deposit
     */
    function deposit(address to, address tokenAddr, uint128 amount) external payable {
        RollupLib.requireActive();
        uint32 accountId = AccountLib.getValidAccount(to);
        _deposit(msg.sender, to, accountId, tokenAddr, amount);
    }

    /**
     * @inheritdoc IAccountFacet
     * @dev Only registered accounts can withdraw
     * @dev The token cannot be TSB token
     */
    //! virtual for test
    function withdraw(address tokenAddr, uint128 amount) external virtual nonReentrant {
        uint32 accountId = AccountLib.getValidAccount(msg.sender);
        (uint16 tokenId, AssetConfig memory assetConfig) = TokenLib.getValidToken(tokenAddr);
        AccountLib.updateWithdrawRecord(msg.sender, accountId, tokenId, amount);
        assetConfig.isTsbToken
            ? TsbLib.mintTsbToken(tokenAddr, msg.sender, amount)
            : Utils.transfer(tokenAddr, payable(msg.sender), amount);
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function forceWithdraw(address tokenAddr) external {
        uint32 accountId = AccountLib.getValidAccount(msg.sender);
        (uint16 tokenId, ) = TokenLib.getValidToken(tokenAddr);
        AccountLib.addForceWithdrawReq(msg.sender, accountId, tokenId);
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function getAccountAddr(uint32 accountId) external view returns (address accountAddr) {
        return AccountLib.getAccountAddr(accountId);
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function getAccountId(address accountAddr) external view returns (uint32 accountId) {
        return AccountLib.getAccountId(accountAddr);
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function getAccountNum() external view returns (uint32 accountNum) {
        return AccountLib.getAccountNum();
    }

    /// @notice Internal register function
    /// @param sender The address of sender
    /// @param tsPubKeyX The x coordinate of the public key of the token sender
    /// @param tsPubKeyY The y coordinate of the public key of the token sender
    /// @return accountId The registered L2 account Id
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
            : Utils.transferFrom(tokenAddr, depositor, amount, msg.value);

        AccountLib.addDepositReq(to, accountId, tokenId, assetConfig.decimals, amount);
    }
}