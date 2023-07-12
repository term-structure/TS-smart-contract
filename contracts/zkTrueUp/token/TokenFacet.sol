// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
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
        IERC20 token = assetConfig.token;
        Utils.notZeroAddr(address(token));
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        if (tsl.getTokenId(token) != 0) revert TokenIsWhitelisted(token);
        uint16 newTokenId = tsl.getTokenNum() + 1;
        if (newTokenId > Config.MAX_AMOUNT_OF_REGISTERED_TOKENS) revert TokenNumExceedLimit(newTokenId);

        tsl.tokenNum = newTokenId;
        tsl.tokenIds[token] = newTokenId;
        tsl.assetConfigs[newTokenId] = assetConfig;

        if (assetConfig.isTsbToken) {
            ITsbToken tsbToken = ITsbToken(address(token));
            (, uint32 maturityTime) = tsbToken.tokenInfo();
            emit TsbTokenWhitelisted(tsbToken, newTokenId, assetConfig, maturityTime);
        } else {
            emit BaseTokenWhitelisted(token, newTokenId, assetConfig);
        }
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function setPaused(IERC20 token, bool isPaused) external onlyRole(Config.ADMIN_ROLE) {
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        tsl.getValidTokenId(token);
        tsl.paused[token] = isPaused;
        emit SetPaused(token, isPaused);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function setPriceFeed(IERC20 token, AggregatorV3Interface priceFeed) external onlyRole(Config.ADMIN_ROLE) {
        Utils.notZeroAddr(address(priceFeed));
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        uint16 tokenId = tsl.getValidTokenId(token);
        tsl.assetConfigs[tokenId].priceFeed = priceFeed;
        emit SetPriceFeed(token, priceFeed);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function setIsStableCoin(IERC20 token, bool isStableCoin) external onlyRole(Config.ADMIN_ROLE) {
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        uint16 tokenId = tsl.getValidTokenId(token);
        tsl.assetConfigs[tokenId].isStableCoin = isStableCoin;
        emit SetIsStableCoin(token, isStableCoin);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function setMinDepositAmt(IERC20 token, uint128 minDepositAmt) external onlyRole(Config.ADMIN_ROLE) {
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        uint16 tokenId = tsl.getValidTokenId(token);
        tsl.assetConfigs[tokenId].minDepositAmt = minDepositAmt;
        emit SetMinDepositAmt(token, minDepositAmt);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function getTokenNum() external view returns (uint16) {
        return TokenStorage.layout().getTokenNum();
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function getTokenId(IERC20 token) external view returns (uint16) {
        return TokenStorage.layout().getTokenId(token);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function getAssetConfig(uint16 tokenId) external view returns (AssetConfig memory) {
        return TokenStorage.layout().getAssetConfig(tokenId);
    }

    /**
     * @inheritdoc ITokenFacet
     */
    function isTokenPaused(IERC20 token) external view returns (bool) {
        return TokenStorage.layout().isPaused(token);
    }
}
