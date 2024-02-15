// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {AccountStorage} from "../account/AccountStorage.sol";
import {RollupStorage} from "../rollup/RollupStorage.sol";
import {TokenStorage} from "../token/TokenStorage.sol";
import {TsbStorage, REDEEM_TYPEHASH} from "./TsbStorage.sol";
import {TsbLib} from "./TsbLib.sol";
import {ITsbFacet} from "./ITsbFacet.sol";
import {TsbToken} from "../tsb/TsbToken.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {Config} from "../libraries/Config.sol";
import {Utils} from "../libraries/Utils.sol";
import {Signature} from "../libraries/Signature.sol";

/**
 * @title Term Structure Bond Facet Contract
 * @author Term Structure Labs
 * @notice The Term Structure Bond Facet (TsbFacet) is a contract to manages TsbTokens
 */
contract TsbFacet is ITsbFacet, AccessControlInternal, ReentrancyGuard {
    using AccountLib for AccountStorage.Layout;
    using TokenLib for TokenStorage.Layout;
    using TsbLib for TsbStorage.Layout;
    using Utils for *;

    /* ============ External Admin Functions ============ */

    /**
     * @inheritdoc ITsbFacet
     * @dev This function is only called by the operator
     */
    function createTsbToken(
        uint16 underlyingTokenId,
        uint32 maturityTime,
        string memory name,
        string memory symbol
    ) external virtual onlyRole(Config.OPERATOR_ROLE) {
        // solhint-disable-next-line not-rely-on-time
        if (maturityTime <= block.timestamp) revert InvalidMaturityTime(maturityTime);
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        IERC20 underlyingAsset = tsl.getAssetConfig(underlyingTokenId).token;
        if (address(underlyingAsset) == address(0)) revert UnderlyingAssetIsNotExist(underlyingTokenId);

        TsbStorage.Layout storage tsbsl = TsbStorage.layout();
        uint48 tsbTokenKey = TsbLib.calcTsbTokenKey(underlyingTokenId, maturityTime);
        ITsbToken tsbToken = tsbsl.getTsbToken(tsbTokenKey);
        if (address(tsbToken) != address(0)) revert TsbTokenIsExist(tsbToken);

        try new TsbToken(name, symbol, underlyingAsset, maturityTime) returns (TsbToken newTsbToken) {
            tsbToken = ITsbToken(address(newTsbToken));
            tsbsl.tsbTokens[tsbTokenKey] = tsbToken;
            emit TsbTokenCreated(tsbToken, underlyingAsset, maturityTime);
        } catch {
            revert TsbTokenCreateFailed(name, symbol, underlyingAsset, maturityTime);
        }
    }

    /* ============ External Functions ============ */

    /**
     * @inheritdoc ITsbFacet
     * @dev TSB token can be redeemed only after maturity
     * @dev TSB token decimals is 8 and should be converted to underlying asset decimals when 1:1 redeem
     */
    function redeem(
        address accountAddr,
        ITsbToken tsbToken,
        uint128 amount,
        bool redeemAndDeposit
    ) external nonReentrant {
        AccountStorage.Layout storage asl = AccountStorage.layout();
        asl.requireValidCaller(msg.sender, accountAddr);

        uint32 accountId = asl.getValidAccount(accountAddr);
        _redeem(msg.sender, accountAddr, accountId, tsbToken, amount, redeemAndDeposit);
    }

    /**
     * @inheritdoc ITsbFacet
     * @dev TSB token can be redeemed only after maturity
     * @dev TSB token decimals is 8 and should be converted to underlying asset decimals when 1:1 redeem
     */
    function redeemWithPermit(
        address accountAddr,
        ITsbToken tsbToken,
        uint128 amount,
        bool redeemAndDeposit,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        Signature.verifyDeadline(deadline);

        AccountStorage.Layout storage asl = AccountStorage.layout();
        bytes32 structHash = _calcRedeemStructHash(
            msg.sender,
            tsbToken,
            amount,
            redeemAndDeposit,
            asl.getNonce(accountAddr),
            deadline
        );
        Signature.verifySignature(accountAddr, structHash, v, r, s);

        asl.increaseNonce(accountAddr);

        uint32 accountId = asl.getValidAccount(accountAddr);

        _redeem(msg.sender, accountAddr, accountId, tsbToken, amount, redeemAndDeposit);
    }

    /* ============ External View Functions ============ */

    /**
     * @inheritdoc ITsbFacet
     */
    function getTsbToken(uint16 underlyingTokenId, uint32 maturity) external view returns (ITsbToken) {
        uint48 tsbTokenKey = TsbLib.calcTsbTokenKey(underlyingTokenId, maturity);
        return TsbStorage.layout().getTsbToken(tsbTokenKey);
    }

    /**
     * @inheritdoc ITsbFacet
     */
    function balanceOf(address account, ITsbToken tsbToken) external view returns (uint256) {
        return tsbToken.balanceOf(account);
    }

    /**
     * @inheritdoc ITsbFacet
     */
    function allowance(address owner, address spender, ITsbToken tsbToken) external view returns (uint256) {
        return tsbToken.allowance(owner, spender);
    }

    /**
     * @inheritdoc ITsbFacet
     */
    function activeSupply(ITsbToken tsbToken) external view returns (uint256) {
        return tsbToken.totalSupply();
    }

    /**
     * @inheritdoc ITsbFacet
     */
    function getUnderlyingAsset(ITsbToken tsbToken) external view returns (IERC20) {
        (IERC20 underlyingAsset, ) = tsbToken.tokenInfo();
        return underlyingAsset;
    }

    /**
     * @inheritdoc ITsbFacet
     */
    function getMaturityTime(ITsbToken tsbToken) external view returns (uint32) {
        (, uint32 maturityTime) = tsbToken.tokenInfo();
        return maturityTime;
    }

    /* ============ Internal Functions ============ */

    /// @notice Internal redeem collateral function
    /// @param caller The caller of the function
    /// @param accountAddr The address of the account in L1
    /// @param accountId The id of the account in L2
    /// @param tsbToken The TsbToken to be redeemed
    /// @param amount The amount of the TsbToken to be redeemed
    /// @param redeemAndDeposit The flag of redeem and deposit
    function _redeem(
        address caller,
        address accountAddr,
        uint32 accountId,
        ITsbToken tsbToken,
        uint128 amount,
        bool redeemAndDeposit
    ) internal {
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        (, AssetConfig memory assetConfig) = tsl.getAssetConfig(tsbToken);
        if (!assetConfig.isTsbToken) revert InvalidTsbToken(tsbToken);

        (IERC20 underlyingAsset, uint32 maturityTime) = tsbToken.tokenInfo();
        TsbLib.requireMatured(tsbToken, maturityTime);

        TsbLib.burnTsbToken(tsbToken, accountAddr, amount);
        emit Redemption(caller, accountAddr, tsbToken, underlyingAsset, amount, redeemAndDeposit);

        (uint16 tokenId, AssetConfig memory underlyingAssetConfig) = tsl.getValidToken(underlyingAsset);
        // convert amount by decimals to 1:1 redeem underlying asset
        uint128 underlyingAssetAmt = SafeCast.toUint128(amount.toL1Amt(underlyingAssetConfig.decimals));

        if (redeemAndDeposit) {
            TokenLib.validDepositAmt(underlyingAssetAmt, underlyingAssetConfig.minDepositAmt);
            AccountLib.addDepositReq(
                RollupStorage.layout(),
                caller,
                accountAddr,
                accountId,
                underlyingAssetConfig.token,
                tokenId,
                underlyingAssetConfig.decimals,
                underlyingAssetAmt
            );
        } else {
            Utils.transfer(underlyingAsset, payable(accountAddr), underlyingAssetAmt);
        }
    }

    /* ============ Internal Pure Functions to Calculate Struct Hash ============ */

    /// @notice Calculate the hash of the struct for the redeem permit
    /// @param delegatee The delegatee of the permit
    /// @param tsbToken The TsbToken to be redeemed
    /// @param amount The amount of the TsbToken to be redeemed
    /// @param redeemAndDeposit The flag of redeem and deposit
    /// @param nonce The nonce of the permit
    /// @param deadline The deadline of the permit
    function _calcRedeemStructHash(
        address delegatee,
        ITsbToken tsbToken,
        uint128 amount,
        bool redeemAndDeposit,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(REDEEM_TYPEHASH, delegatee, tsbToken, redeemAndDeposit, amount, nonce, deadline));
    }
}
