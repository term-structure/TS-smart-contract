// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {AccountStorage, WITHDRAW_TYPEHASH} from "./AccountStorage.sol";
import {AddressStorage} from "../address/AddressStorage.sol";
import {RollupStorage} from "../rollup/RollupStorage.sol";
import {TokenStorage, AssetConfig} from "../token/TokenStorage.sol";
import {EvacuationStorage} from "../evacuation/EvacuationStorage.sol";
import {IAccountFacet} from "./IAccountFacet.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {AccountLib} from "./AccountLib.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {EvacuationLib} from "../evacuation/EvacuationLib.sol";
import {Config} from "../libraries/Config.sol";
import {Utils} from "../libraries/Utils.sol";
import {BabyJubJub, Point} from "../libraries/BabyJubJub.sol";
import {DELEGATE_WITHDRAW_MASK} from "../libraries/Delegate.sol";

/**
 * @title Term Structure Account Facet Contract
 * @author Term Structure Labs
 * @notice The AccountFacet is a contract to manages accounts in Term Structure Protocol,
 *         including many I.O. operations such as register, deposit, withdraw, forceWithdraw, etc.
 */
contract AccountFacet is IAccountFacet, ReentrancyGuard {
    using AccountLib for *;
    using AddressLib for AddressStorage.Layout;
    using RollupLib for RollupStorage.Layout;
    using TokenLib for TokenStorage.Layout;
    using EvacuationLib for EvacuationStorage.Layout;

    /* ============ External Functions ============ */

    /**
     * @inheritdoc IAccountFacet
     * @dev The account is registered by depositing Ether or whitelisted ERC20 to ZkTrueUp
     */
    function register(uint256 tsPubKeyX, uint256 tsPubKeyY, IERC20 token, uint128 amount) external payable {
        EvacuationStorage.Layout storage esl = EvacuationStorage.layout();
        esl.requireActive();

        TokenStorage.Layout storage tsl = TokenStorage.layout();
        tsl.requireBaseToken(token);

        RollupStorage.Layout storage rsl = RollupStorage.layout();
        uint32 accountId = _register(rsl, msg.sender, tsPubKeyX, tsPubKeyY);
        _deposit(rsl, tsl, msg.sender, msg.sender, accountId, token, amount);
    }

    /**
     * @inheritdoc IAccountFacet
     * @dev Only registered accounts can deposit
     */
    function deposit(address accountAddr, IERC20 token, uint128 amount) external payable {
        EvacuationStorage.Layout storage esl = EvacuationStorage.layout();
        esl.requireActive();

        AccountStorage.Layout storage asl = AccountStorage.layout();
        uint32 accountId = asl.getValidAccount(accountAddr);

        RollupStorage.Layout storage rsl = RollupStorage.layout();
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        _deposit(rsl, tsl, msg.sender, accountAddr, accountId, token, amount);
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function withdraw(address accountAddr, IERC20 token, uint256 amount) external nonReentrant {
        AccountStorage.Layout storage asl = AccountStorage.layout();
        asl.requireValidCaller(msg.sender, accountAddr, DELEGATE_WITHDRAW_MASK);

        uint32 accountId = asl.getValidAccount(accountAddr);
        _withdraw(msg.sender, accountAddr, accountId, token, amount);
    }

    //! mainnet-audit
    /**
     * @inheritdoc IAccountFacet
     */
    function withdrawWithPermit(
        address accountAddr,
        IERC20 token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        AccountStorage.Layout storage asl = AccountStorage.layout();
        uint32 accountId = asl.getValidAccount(accountAddr);

        bytes32 structHash = _calcWithdrawStructHash(token, amount, asl.getPermitNonce(accountAddr), deadline);
        asl.validatePermitAndIncreaseNonce(accountAddr, structHash, deadline, v, r, s);

        _withdraw(msg.sender, accountAddr, accountId, token, amount);
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function forceWithdraw(IERC20 token) external {
        EvacuationStorage.Layout storage esl = EvacuationStorage.layout();
        esl.requireActive();

        AccountStorage.Layout storage asl = AccountStorage.layout();
        uint32 accountId = asl.getValidAccount(msg.sender);

        TokenStorage.Layout storage tsl = TokenStorage.layout();
        (uint16 tokenId, ) = tsl.getValidToken(token);

        AccountLib.addForceWithdrawReq(RollupStorage.layout(), msg.sender, accountId, token, tokenId);
    }

    /**
     * @inheritdoc IAccountFacet
     * @dev Refer to each action mask in the library for different delegated actions (path: ../libraries/Delegate.sol)
     * @dev (i.e. use `DELEGATE_WITHDRAW_MASK` to delegate the withdraw action)
     */
    function setDelegatee(address delegatee, uint256 delegatedActions) external {
        AccountStorage.Layout storage asl = AccountStorage.layout();
        asl.delegatedActions[msg.sender][delegatee] = delegatedActions;
        emit SetDelegatee(msg.sender, delegatee, delegatedActions);
    }

    /* ============ External View Functions ============ */

    /**
     * @inheritdoc IAccountFacet
     */
    function getAccountAddr(uint32 accountId) external view returns (address) {
        return AccountStorage.layout().getAccountAddr(accountId);
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function getAccountId(address accountAddr) external view returns (uint32) {
        return AccountStorage.layout().getAccountId(accountAddr);
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function getAccountNum() external view returns (uint32) {
        return AccountStorage.layout().getAccountNum();
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function getPermitNonce(address accountAddr) external view returns (uint256) {
        return AccountStorage.layout().getPermitNonce(accountAddr);
    }

    /**
     * @inheritdoc IAccountFacet
     * @dev Refer to each action mask in the library for different delegated actions (path: ../libraries/Delegate.sol)
     * @dev (i.e. use `DELEGATE_WITHDRAW_MASK` to check if the withdraw action is delegated)
     */
    function getIsDelegated(address delegator, address delegatee, uint256 actionMask) external view returns (bool) {
        return AccountStorage.layout().getIsDelegated(delegator, delegatee, actionMask);
    }

    /**
     * @inheritdoc IAccountFacet
     */
    function getDelegatedActions(address delegator, address delegatee) external view returns (uint256) {
        return AccountStorage.layout().getDelegatedActions(delegator, delegatee);
    }

    /* ============ Internal Functions ============ */

    /// @notice Internal register function
    /// @param rsl The rollup storage layout
    /// @param caller The address of caller
    /// @param tsPubKeyX The x coordinate of the public key of the token sender
    /// @param tsPubKeyY The y coordinate of the public key of the token sender
    /// @return accountId The registered L2 account Id
    function _register(
        RollupStorage.Layout storage rsl,
        address caller,
        uint256 tsPubKeyX,
        uint256 tsPubKeyY
    ) internal returns (uint32) {
        if (!BabyJubJub.isOnCurve(Point({x: tsPubKeyX, y: tsPubKeyY}))) revert InvalidTsPublicKey(tsPubKeyX, tsPubKeyY);

        AccountStorage.Layout storage asl = AccountStorage.layout();
        uint32 accountId = asl.getAccountNum();
        if (accountId >= Config.MAX_AMOUNT_OF_REGISTERED_ACCOUNT) revert AccountNumExceedLimit(accountId);
        if (asl.getAccountId(caller) != 0) revert AccountIsRegistered(caller);

        asl.accountIds[caller] = accountId;
        asl.accountAddresses[accountId] = caller;
        asl.accountNum += 1;

        AccountLib.addRegisterReq(rsl, caller, accountId, tsPubKeyX, tsPubKeyY);

        return accountId;
    }

    /// @notice Internal deposit function for register and deposit
    /// @param rsl The rollup storage layout
    /// @param tsl The token storage layout
    /// @param caller The address of caller
    /// @param accountAddr The user account address in layer1
    /// @param accountId user account id in layer2
    /// @param token The token to be deposited
    /// @param amount The amount of the token
    function _deposit(
        RollupStorage.Layout storage rsl,
        TokenStorage.Layout storage tsl,
        address caller,
        address accountAddr,
        uint32 accountId,
        IERC20 token,
        uint128 amount
    ) internal {
        (uint16 tokenId, AssetConfig memory assetConfig) = tsl.getValidToken(token);
        TokenLib.validDepositAmt(amount, assetConfig.minDepositAmt);

        Utils.tokenTransferFrom(token, caller, amount, msg.value, assetConfig.isTsbToken);
        AccountLib.addDepositReq(rsl, caller, accountAddr, accountId, token, tokenId, assetConfig.decimals, amount);
    }

    /// @notice Internal withdraw function
    /// @param caller The address of caller
    /// @param accountAddr The user account address in layer1
    /// @param accountId user account id in layer2
    /// @param token The token to be withdrawn
    /// @param amount The amount of the token
    function _withdraw(
        address caller,
        address accountAddr,
        uint32 accountId,
        IERC20 token,
        uint256 amount
    ) internal virtual {
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        (uint16 tokenId, AssetConfig memory assetConfig) = tsl.getValidToken(token);

        RollupStorage.Layout storage rsl = RollupStorage.layout();
        AccountLib.updateWithdrawalRecord(rsl, caller, accountAddr, accountId, token, tokenId, amount);

        Utils.tokenTransfer(token, payable(accountAddr), amount, assetConfig.isTsbToken);
    }

    /* ============ Internal Pure Functions to Calculate Struct Hash ============ */

    //! mainnet-audit
    /// @notice Calculate the hash of the struct for the withdrawal permit
    /// @param token The token to be withdrawn
    /// @param amount The amount of the token to be withdrawn
    /// @param nonce The nonce of the account
    /// @param deadline The deadline of the permit
    function _calcWithdrawStructHash(
        IERC20 token,
        uint256 amount,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(WITHDRAW_TYPEHASH, token, amount, nonce, deadline));
    }
}
