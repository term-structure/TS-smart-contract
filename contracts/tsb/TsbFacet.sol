// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {TsbStorage} from "./TsbStorage.sol";
import {TsbLib} from "./TsbLib.sol";
import {ITsbFacet} from "./ITsbFacet.sol";
import {TsbToken} from "../TsbToken.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {Config} from "../libraries/Config.sol";
import {Utils} from "../libraries/Utils.sol";

contract TsbFacet is ITsbFacet, AccessControlInternal, ReentrancyGuard {
    /**
     * @inheritdoc ITsbFacet
     * @dev This function is only called by the operator
     */
    //! virtual for test
    function createTsbToken(
        uint16 underlyingTokenId,
        uint32 maturityTime,
        string memory name,
        string memory symbol
    ) external virtual onlyRole(Config.OPERATOR_ROLE) returns (address tsbTokenAddr) {
        if (maturityTime <= block.timestamp) revert InvalidMaturityTime(maturityTime);
        address underlyingAssetAddr = TokenLib.getAssetConfig(underlyingTokenId).tokenAddr;
        if (underlyingAssetAddr == address(0)) revert UnderlyingAssetIsNotExist(underlyingTokenId);
        uint48 tsbTokenKey = TsbLib.getTsbTokenKey(underlyingTokenId, maturityTime);
        address tokenAddr = TsbLib.getTsbTokenAddr(tsbTokenKey);
        if (tokenAddr != address(0)) revert TsbTokenIsExist(tokenAddr);
        address tsbTokenAddr = address(new TsbToken(name, symbol, underlyingAssetAddr, maturityTime));
        TsbStorage.layout().tsbTokens[tsbTokenKey] = tsbTokenAddr;
        emit TsbTokenCreated(tsbTokenAddr, underlyingTokenId, maturityTime);
        return tsbTokenAddr;
    }

    /**
     * @inheritdoc ITsbFacet
     * @dev TSB token can be redeemed only after maturity
     */
    function redeem(address tsbTokenAddr, uint128 amount, bool redeemAndDeposit) external nonReentrant {
        (, AssetConfig memory assetConfig) = TokenLib.getAssetConfig(tsbTokenAddr);
        if (!assetConfig.isTsbToken) revert InvalidTsbTokenAddr(tsbTokenAddr);
        (address underlyingAsset, uint32 maturityTime) = ITsbToken(tsbTokenAddr).tokenInfo();
        TsbLib.requireMatured(tsbTokenAddr, maturityTime);

        TsbLib.burnTsbToken(tsbTokenAddr, msg.sender, amount);
        emit Redeem(msg.sender, tsbTokenAddr, underlyingAsset, amount, redeemAndDeposit);

        if (redeemAndDeposit) {
            uint32 accountId = AccountLib.getValidAccount(msg.sender);
            (uint16 tokenId, AssetConfig memory underlyingAssetConfig) = TokenLib.getValidToken(underlyingAsset);
            TokenLib.validDepositAmt(amount, underlyingAssetConfig);
            AccountLib.addDepositReq(msg.sender, accountId, tokenId, underlyingAssetConfig.decimals, amount);
        } else {
            Utils.transfer(underlyingAsset, payable(msg.sender), amount);
        }
    }

    /**
     * @inheritdoc ITsbFacet
     */
    function getTsbTokenAddr(uint16 underlyingTokenId, uint32 maturity) external view returns (address tsbTokenAddr) {
        return TsbLib.getTsbTokenAddr(TsbLib.getTsbTokenKey(underlyingTokenId, maturity));
    }

    /**
     * @inheritdoc ITsbFacet
     */
    function balanceOf(address account, address tsbTokenAddr) external view returns (uint256 balance) {
        return ITsbToken(tsbTokenAddr).balanceOf(account);
    }

    /**
     * @inheritdoc ITsbFacet
     */
    function allowance(
        address owner,
        address spender,
        address tsbTokenAddr
    ) external view returns (uint256 allowance_) {
        return ITsbToken(tsbTokenAddr).allowance(owner, spender);
    }

    /**
     * @inheritdoc ITsbFacet
     */
    function activeSupply(address tsbTokenAddr) external view returns (uint256 totalSupply) {
        return ITsbToken(tsbTokenAddr).totalSupply();
    }

    /**
     * @inheritdoc ITsbFacet
     */
    function getUnderlyingAsset(address tsbTokenAddr) external view returns (address underlyingAsset) {
        (underlyingAsset, ) = ITsbToken(tsbTokenAddr).tokenInfo();
        return underlyingAsset;
    }

    /**
     * @inheritdoc ITsbFacet
     */
    function getMaturityTime(address tsbTokenAddr) external view returns (uint32 maturityTime) {
        (, maturityTime) = ITsbToken(tsbTokenAddr).tokenInfo();
        return maturityTime;
    }
}
