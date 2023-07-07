// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {TokenStorage, AssetConfig} from "./TokenStorage.sol";
import {AddressStorage} from "../address/AddressStorage.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {Config} from "../libraries/Config.sol";

/**
 * @title Term Structure Token Library
 */
library TokenLib {
    using AddressLib for AddressStorage.Layout;

    /// @notice Error for get invalid token which is paused
    error TokenIsPaused(address pausedTokenAddr);
    /// @notice Error for get token which is not whitelisted
    error TokenIsNotExist(address notWhitelistedTokenAddr);
    /// @notice Error for deposit amount is invalid
    error InvalidDepositAmt(uint128 depositAmt);
    /// @notice Error for register account with tsb token
    error InvalidBaseTokenAddr(address invalidTokenAddr);

    /// Internal function to check if the token is base token
    /// @param s The token storage
    /// @param tokenAddr The token address to be checked
    function requireBaseToken(TokenStorage.Layout storage s, address tokenAddr) internal view {
        (, AssetConfig memory assetConfig) = getValidToken(s, tokenAddr);
        if (assetConfig.isTsbToken) revert InvalidBaseTokenAddr(tokenAddr);
    }

    /// @notice Internal function to get the total number of the registered tokens
    /// @param s The token storage
    /// @return tokenNum The total number of the registered tokens
    function getTokenNum(TokenStorage.Layout storage s) internal view returns (uint16) {
        return s.tokenNum;
    }

    /// @notice Internal function to get the valid Layer2 token address and the configuration of the token
    /// @dev The L1 token address of a valid token cannot be 0 address and the token can not be paused
    /// @param s The token storage
    /// @param tokenAddr The token address on Layer1
    /// @return tokenId The token id on Layer2
    /// @return assetConfig The configuration of the token
    function getValidToken(
        TokenStorage.Layout storage s,
        address tokenAddr
    ) internal view returns (uint16, AssetConfig memory) {
        tokenAddr = tokenAddr == AddressLib.getAddressStorage().getWETHAddr() ? Config.ETH_ADDRESS : tokenAddr;
        bool isTokenPaused = s.paused[tokenAddr];
        if (isTokenPaused) revert TokenIsPaused(tokenAddr);

        uint16 tokenId = getValidTokenId(s, tokenAddr);
        AssetConfig memory assetConfig = s.assetConfigs[tokenId];
        return (tokenId, assetConfig);
    }

    /// @notice Internal function to get valid token id by l1 token address
    /// @param s The token storage
    /// @param tokenAddr The token address on Layer1
    /// @return tokenId The token id on Layer2
    function getValidTokenId(TokenStorage.Layout storage s, address tokenAddr) internal view returns (uint16) {
        uint16 tokenId = s.tokenIds[tokenAddr];
        if (tokenId == 0) revert TokenIsNotExist(tokenAddr);
        return tokenId;
    }

    /// @notice Internal function to get the configuration of the token by token id
    /// @param s The token storage
    /// @param tokenId The token id on Layer2
    /// @return assetConfig The configuration of the token
    function getAssetConfig(TokenStorage.Layout storage s, uint16 tokenId) internal view returns (AssetConfig memory) {
        return s.assetConfigs[tokenId];
    }

    /// @notice Internal function to get the configuration of the token by token address
    /// @param s The token storage
    /// @param tokenAddr The token address on Layer1
    /// @return tokenId The token id on Layer2
    /// @return assetConfig The configuration of the token
    function getAssetConfig(
        TokenStorage.Layout storage s,
        address tokenAddr
    ) internal view returns (uint16, AssetConfig memory) {
        uint16 tokenId = s.tokenIds[tokenAddr];
        return (tokenId, s.assetConfigs[tokenId]);
    }

    /// @notice Internal function to get the Layer2 token id by token address
    /// @param s The token storage
    /// @param tokenAddr The token address on Layer1
    /// @return tokenId The token id on Layer2
    function getTokenId(TokenStorage.Layout storage s, address tokenAddr) internal view returns (uint16) {
        return s.tokenIds[tokenAddr];
    }

    /// @notice Internal function to get the status of the token
    /// @param s The token storage
    /// @param tokenAddr The token address on Layer1
    /// @return isPaused The status of the token
    function isPaused(TokenStorage.Layout storage s, address tokenAddr) internal view returns (bool) {
        return s.paused[tokenAddr];
    }

    /// @notice Internal function to check if the deposit amount is valid
    /// @param depositAmt The deposit amount to be checked
    /// @param assetConfig The configuration of the token
    function validDepositAmt(uint128 depositAmt, AssetConfig memory assetConfig) internal pure {
        if (depositAmt < assetConfig.minDepositAmt) revert InvalidDepositAmt(depositAmt);
    }

    /// @notice Internal function to get the token storage layout
    /// @return tokenStorage The token storage layout
    function getTokenStorage() internal pure returns (TokenStorage.Layout storage) {
        return TokenStorage.layout();
    }
}
