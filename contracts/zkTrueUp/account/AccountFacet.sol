// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {AccountStorage} from "./AccountStorage.sol";
import {RollupStorage} from "../rollup/RollupStorage.sol";
import {TokenStorage} from "../token/TokenStorage.sol";
import {IAccountFacet} from "./IAccountFacet.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {AccountLib} from "./AccountLib.sol";
import {TsbLib} from "../tsb/TsbLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {Config} from "../libraries/Config.sol";
import {Utils} from "../libraries/Utils.sol";

/**
 * @title Term Structure Account Facet Contract
 */
contract AccountFacet is IAccountFacet, ReentrancyGuard {
    using AccountLib for AccountStorage.Layout;
    using RollupLib for RollupStorage.Layout;
    using TokenLib for TokenStorage.Layout;

    /**
     * @inheritdoc IAccountFacet
     * @dev The account is registered by depositing Ether or whitelisted ERC20 to ZkTrueUp
     */
    function register(uint256 tsPubKeyX, uint256 tsPubKeyY, address tokenAddr, uint128 amount) external payable {
        RollupStorage.Layout storage rsl = RollupLib.getRollupStorage();
        rsl.requireActive();

        TokenStorage.Layout storage tsl = TokenLib.getTokenStorage();
        tsl.requireBaseToken(tokenAddr);

        uint32 accountId = _register(rsl, msg.sender, tsPubKeyX, tsPubKeyY);
        _deposit(rsl, tsl, msg.sender, msg.sender, accountId, tokenAddr, amount);
    }

    /**
     * @inheritdoc IAccountFacet
     * @dev Only registered accounts can deposit
     */
    function deposit(address to, address tokenAddr, uint128 amount) external payable {
        RollupStorage.Layout storage rsl = RollupLib.getRollupStorage();
        rsl.requireActive();

        uint32 accountId = AccountLib.getAccountStorage().getValidAccount(to);

        TokenStorage.Layout storage tsl = TokenLib.getTokenStorage();
        _deposit(rsl, tsl, msg.sender, to, accountId, tokenAddr, amount);
    }

    /**
     * @inheritdoc IAccountFacet
     * @dev Only registered accounts can withdraw
     * @dev The token cannot be TSB token
     */
    function withdraw(address tokenAddr, uint128 amount) external virtual nonReentrant {
        uint32 accountId = AccountLib.getAccountStorage().getValidAccount(msg.sender);
        TokenStorage.Layout storage tsl = TokenLib.getTokenStorage();
        (uint16 tokenId, AssetConfig memory assetConfig) = tsl.getValidToken(tokenAddr);

        RollupStorage.Layout storage rsl = RollupLib.getRollupStorage();
        AccountLib.updateWithdrawRecord(rsl, msg.sender, accountId, tokenAddr, tokenId, amount);
        assetConfig.isTsbToken
            ? TsbLib.mintTsbToken(tokenAddr, msg.sender, amount)
            : Utils.transfer(tokenAddr, payable(msg.sender), amount);
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function forceWithdraw(address tokenAddr) external {
        uint32 accountId = AccountLib.getAccountStorage().getValidAccount(msg.sender);
        (uint16 tokenId, ) = TokenLib.getTokenStorage().getValidToken(tokenAddr);

        RollupStorage.Layout storage rsl = RollupLib.getRollupStorage();
        AccountLib.addForceWithdrawReq(rsl, msg.sender, accountId, tokenAddr, tokenId);
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function getAccountAddr(uint32 accountId) external view returns (address) {
        return AccountLib.getAccountStorage().getAccountAddr(accountId);
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function getAccountId(address accountAddr) external view returns (uint32) {
        return AccountLib.getAccountStorage().getAccountId(accountAddr);
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function getAccountNum() external view returns (uint32) {
        return AccountLib.getAccountStorage().getAccountNum();
    }

    /// @notice Internal register function
    /// @param rsl The rollup storage layout
    /// @param sender The address of sender
    /// @param tsPubKeyX The x coordinate of the public key of the token sender
    /// @param tsPubKeyY The y coordinate of the public key of the token sender
    /// @return accountId The registered L2 account Id
    function _register(
        RollupStorage.Layout storage rsl,
        address sender,
        uint256 tsPubKeyX,
        uint256 tsPubKeyY
    ) internal returns (uint32) {
        AccountStorage.Layout storage asl = AccountLib.getAccountStorage();
        uint32 accountId = asl.getAccountNum();
        if (accountId >= Config.MAX_AMOUNT_OF_REGISTERED_ACCOUNT) revert AccountNumExceedLimit(accountId);
        if (asl.getAccountId(msg.sender) != 0) revert AccountIsRegistered(msg.sender);

        asl.accountIds[sender] = accountId;
        asl.accountAddresses[accountId] = sender;
        asl.accountNum++;
        AccountLib.addRegisterReq(rsl, sender, accountId, tsPubKeyX, tsPubKeyY);
        return accountId;
    }

    /// @notice Internal deposit function for register and deposit
    /// @param rsl The rollup storage layout
    /// @param tsl The token storage layout
    /// @param depositor The address that deposit the L1 token
    /// @param to The address credtied with the deposit
    /// @param accountId user account id in layer2
    /// @param tokenAddr The address of the token to be deposited
    /// @param amount The amount of the token
    function _deposit(
        RollupStorage.Layout storage rsl,
        TokenStorage.Layout storage tsl,
        address depositor,
        address to,
        uint32 accountId,
        address tokenAddr,
        uint128 amount
    ) internal {
        (uint16 tokenId, AssetConfig memory assetConfig) = tsl.getValidToken(tokenAddr);
        TokenLib.validDepositAmt(amount, assetConfig);
        assetConfig.isTsbToken
            ? TsbLib.burnTsbToken(tokenAddr, to, amount)
            : Utils.transferFrom(tokenAddr, depositor, amount, msg.value);

        AccountLib.addDepositReq(rsl, to, accountId, tokenAddr, tokenId, assetConfig.decimals, amount);
    }
}
