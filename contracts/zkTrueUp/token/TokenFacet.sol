// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {TokenStorage, AssetConfig} from "./TokenStorage.sol";
import {TokenLib} from "./TokenLib.sol";
import {ITokenFacet} from "./ITokenFacet.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {Config} from "../libraries/Config.sol";
import {Utils} from "../libraries/Utils.sol";

contract TokenFacet is AccessControlInternal, ITokenFacet {
    /**
     * @inheritdoc ITokenFacet
     */
    function addToken(AssetConfig memory assetConfig) external onlyRole(Config.OPERATOR_ROLE) {
        address tokenAddr = assetConfig.tokenAddr;
        Utils.noneZeroAddr(tokenAddr);
        if (TokenLib.getTokenId(tokenAddr) != 0) revert TokenIsWhitelisted(tokenAddr);
        uint16 newTokenId = TokenLib.getTokenNum() + 1;
        if (newTokenId > Config.MAX_AMOUNT_OF_REGISTERED_TOKENS) revert TokenNumExceedLimit(newTokenId);

        TokenStorage.Layout storage tsl = TokenStorage.layout();
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
        TokenLib.getValidTokenId(tokenAddr);
        TokenStorage.layout().isPaused[tokenAddr] = isPaused;
        emit SetPaused(tokenAddr, isPaused);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function setPriceFeed(address tokenAddr, address priceFeed) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(priceFeed);
        uint16 tokenId = TokenLib.getValidTokenId(tokenAddr);
        TokenStorage.layout().assetConfigs[tokenId].priceFeed = priceFeed;
        emit SetPriceFeed(tokenAddr, priceFeed);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function setIsStableCoin(address tokenAddr, bool isStableCoin) external onlyRole(Config.ADMIN_ROLE) {
        uint16 tokenId = TokenLib.getValidTokenId(tokenAddr);
        TokenStorage.layout().assetConfigs[tokenId].isStableCoin = isStableCoin;
        emit SetIsStableCoin(tokenAddr, isStableCoin);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function setMinDepositAmt(address tokenAddr, uint128 minDepositAmt) external onlyRole(Config.ADMIN_ROLE) {
        uint16 tokenId = TokenLib.getValidTokenId(tokenAddr);
        TokenStorage.layout().assetConfigs[tokenId].minDepositAmt = minDepositAmt;
        emit SetMinDepositAmt(tokenAddr, minDepositAmt);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function getTokenNum() external view returns (uint16 tokenNum) {
        return TokenLib.getTokenNum();
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function getTokenId(address tokenAddr) external view returns (uint16 tokenId) {
        return TokenLib.getTokenId(tokenAddr);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function getAssetConfig(uint16 tokenId) external view returns (AssetConfig memory) {
        return TokenLib.getAssetConfig(tokenId);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function isTokenPaused(address tokenAddr) external view returns (bool) {
        return TokenLib.isPaused(tokenAddr);
    }
}
