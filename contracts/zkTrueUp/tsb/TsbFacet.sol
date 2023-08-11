// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {AccountStorage} from "../account/AccountStorage.sol";
import {RollupStorage} from "../rollup/RollupStorage.sol";
import {TokenStorage} from "../token/TokenStorage.sol";
import {TsbStorage} from "./TsbStorage.sol";
import {TsbLib} from "./TsbLib.sol";
import {ITsbFacet} from "./ITsbFacet.sol";
import {TsbToken} from "../tsb/TsbToken.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {Config} from "../libraries/Config.sol";
import {Utils} from "../libraries/Utils.sol";

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
    function redeem(ITsbToken tsbToken, uint128 amount, bool redeemAndDeposit) external nonReentrant {
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        (, AssetConfig memory assetConfig) = tsl.getAssetConfig(tsbToken);
        if (!assetConfig.isTsbToken) revert InvalidTsbToken(tsbToken);

        (IERC20 underlyingAsset, uint32 maturityTime) = tsbToken.tokenInfo();
        TsbLib.requireMatured(tsbToken, maturityTime);

        TsbLib.burnTsbToken(tsbToken, msg.sender, amount);
        emit Redemption(msg.sender, tsbToken, underlyingAsset, amount, redeemAndDeposit);

        (uint16 tokenId, AssetConfig memory underlyingAssetConfig) = tsl.getValidToken(underlyingAsset);
        // 1:1 redeem to underlying asset
        uint128 underlyingAssetAmt = SafeCast.toUint128(amount.toL1Amt(underlyingAssetConfig.decimals));

        if (redeemAndDeposit) {
            uint32 accountId = AccountStorage.layout().getValidAccount(msg.sender);
            TokenLib.validDepositAmt(underlyingAssetAmt, underlyingAssetConfig.minDepositAmt);
            AccountLib.addDepositReq(
                RollupStorage.layout(),
                msg.sender,
                accountId,
                underlyingAssetConfig.token,
                tokenId,
                underlyingAssetConfig.decimals,
                underlyingAssetAmt
            );
        } else {
            Utils.transfer(underlyingAsset, payable(msg.sender), underlyingAssetAmt);
        }
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
}
