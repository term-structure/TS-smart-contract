// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {TokenStorage, AssetConfig} from "./TokenStorage.sol";
import {TokenLib} from "./TokenLib.sol";
import {ITokenFacet} from "./ITokenFacet.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {Config} from "../libraries/Config.sol";
import {Utils} from "../libraries/Utils.sol";

/**
 * @title Term Structure Token Facet Contract
 */
contract TokenFacet is AccessControlInternal, ITokenFacet {
    using TokenLib for TokenStorage.Layout;

    /**
     * @inheritdoc ITokenFacet
     */
    function addToken(AssetConfig memory assetConfig) external onlyRole(Config.OPERATOR_ROLE) {
        address tokenAddr = assetConfig.tokenAddr;
        Utils.noneZeroAddr(tokenAddr);
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        if (tsl.getTokenId(tokenAddr) != 0) revert TokenIsWhitelisted(tokenAddr);
        uint16 newTokenId = tsl.getTokenNum() + 1;
        if (newTokenId > Config.MAX_AMOUNT_OF_REGISTERED_TOKENS) revert TokenNumExceedLimit(newTokenId);

        tsl.tokenNum = newTokenId;
        tsl.tokenIds[tokenAddr] = newTokenId;
        tsl.assetConfigs[newTokenId] = assetConfig;

        if (assetConfig.isTsbToken) {
            (, uint32 maturityTime) = ITsbToken(tokenAddr).tokenInfo();
            emit WhitelistTsbToken(tokenAddr, newTokenId, assetConfig, maturityTime);
        } else {
            emit WhitelistBaseToken(tokenAddr, newTokenId, assetConfig);
        }
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function setPaused(address tokenAddr, bool isPaused) external onlyRole(Config.ADMIN_ROLE) {
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        tsl.getValidTokenId(tokenAddr);
        tsl.paused[tokenAddr] = isPaused;
        emit SetPaused(tokenAddr, isPaused);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function setPriceFeed(address tokenAddr, address priceFeed) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(priceFeed);
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        uint16 tokenId = tsl.getValidTokenId(tokenAddr);
        tsl.assetConfigs[tokenId].priceFeed = priceFeed;
        emit SetPriceFeed(tokenAddr, priceFeed);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function setIsStableCoin(address tokenAddr, bool isStableCoin) external onlyRole(Config.ADMIN_ROLE) {
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        uint16 tokenId = tsl.getValidTokenId(tokenAddr);
        tsl.assetConfigs[tokenId].isStableCoin = isStableCoin;
        emit SetIsStableCoin(tokenAddr, isStableCoin);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function setMinDepositAmt(address tokenAddr, uint128 minDepositAmt) external onlyRole(Config.ADMIN_ROLE) {
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        uint16 tokenId = tsl.getValidTokenId(tokenAddr);
        tsl.assetConfigs[tokenId].minDepositAmt = minDepositAmt;
        emit SetMinDepositAmt(tokenAddr, minDepositAmt);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function getTokenNum() external view returns (uint16) {
        return TokenLib.getTokenStorage().getTokenNum();
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function getTokenId(address tokenAddr) external view returns (uint16) {
        return TokenLib.getTokenStorage().getTokenId(tokenAddr);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function getAssetConfig(uint16 tokenId) external view returns (AssetConfig memory) {
        return TokenLib.getTokenStorage().getAssetConfig(tokenId);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function isTokenPaused(address tokenAddr) external view returns (bool) {
        return TokenLib.getTokenStorage().isPaused(tokenAddr);
    }
}
