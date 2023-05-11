// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {TokenStorage, AssetConfig} from "./TokenStorage.sol";
import {TokenLib} from "./TokenLib.sol";
import {ITokenFacet} from "./ITokenFacet.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {Config} from "../libraries/Config.sol";
import {Checker} from "../libraries/Checker.sol";

contract TokenFacet is AccessControlInternal, ITokenFacet {
    /// @notice Add a new token to the network
    /// @param assetConfig The configuration of the token
    function addToken(AssetConfig memory assetConfig) external onlyRole(Config.OPERATOR_ROLE) {
        address tokenAddr = assetConfig.tokenAddr;
        Checker.noneZeroAddr(tokenAddr);
        if (TokenLib.getTokenId(tokenAddr) != 0) revert TokenIsWhitelisted(tokenAddr);
        uint16 newTokenId = TokenLib.getTokenNum() + 1;
        if (newTokenId > Config.MAX_AMOUNT_OF_REGISTERED_TOKENS) revert TokenNumExceedLimit(newTokenId);
        TokenStorage.layout().tokenNum = newTokenId;
        TokenStorage.layout().tokenIds[tokenAddr] = newTokenId;
        TokenStorage.layout().assetConfigs[newTokenId] = assetConfig;
        if (assetConfig.isTsbToken) {
            (, uint32 maturityTime) = ITsbToken(tokenAddr).tokenInfo();
            emit WhitelistTsbToken(tokenAddr, newTokenId, assetConfig, maturityTime);
        } else {
            emit WhitelistBaseToken(tokenAddr, newTokenId, assetConfig);
        }
    }

    /// @notice Set paused state of the token
    /// @param tokenAddr The token address
    /// @param isPaused The boolean value of paused state
    function setPaused(address tokenAddr, bool isPaused) external onlyRole(Config.ADMIN_ROLE) {
        TokenLib.getValidTokenId(tokenAddr);
        TokenStorage.layout().isPaused[tokenAddr] = isPaused;
        emit SetPaused(tokenAddr, isPaused);
    }

    /// @notice Set the price feed address of the token
    /// @param tokenAddr The token address
    /// @param priceFeed The address of the price feed
    function setPriceFeed(address tokenAddr, address priceFeed) external onlyRole(Config.ADMIN_ROLE) {
        Checker.noneZeroAddr(priceFeed);
        uint16 tokenId = TokenLib.getValidTokenId(tokenAddr);
        TokenStorage.layout().assetConfigs[tokenId].priceFeed = priceFeed;
        emit SetPriceFeed(tokenAddr, priceFeed);
    }

    /// @notice Set is stable coin of the token
    /// @param tokenAddr The token address
    /// @param isStableCoin The boolean value of is stable coin
    function setIsStableCoin(address tokenAddr, bool isStableCoin) external onlyRole(Config.ADMIN_ROLE) {
        uint16 tokenId = TokenLib.getValidTokenId(tokenAddr);
        TokenStorage.layout().assetConfigs[tokenId].isStableCoin = isStableCoin;
        emit SetIsStableCoin(tokenAddr, isStableCoin);
    }

    /// @notice Set the minimum deposit amount of the token
    /// @param tokenAddr The token address
    /// @param minDepositAmt The minimum deposit amount
    function setMinDepositAmt(address tokenAddr, uint128 minDepositAmt) external onlyRole(Config.ADMIN_ROLE) {
        uint16 tokenId = TokenLib.getValidTokenId(tokenAddr);
        TokenStorage.layout().assetConfigs[tokenId].minDepositAmt = minDepositAmt;
        emit SetMinDepositAmt(tokenAddr, minDepositAmt);
    }

    /// @notice Return the token number
    /// @return tokenNum The token number
    function getTokenNum() external view returns (uint16) {
        return TokenLib.getTokenNum();
    }

    /// @notice Return the token id
    /// @param tokenAddr The token address
    /// @return tokenId The token id
    function getTokenId(address tokenAddr) external view returns (uint16) {
        return TokenLib.getTokenId(tokenAddr);
    }
}
