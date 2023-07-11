// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
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
    error TokenIsPaused(IERC20 pausedToken);
    /// @notice Error for get token which is not whitelisted
    error TokenIsNotExist(IERC20 notWhitelistedToken);
    /// @notice Error for deposit amount is invalid
    error InvalidDepositAmt(uint128 depositAmt, uint128 minDepositAmt);
    /// @notice Error for register account with tsb token
    error InvalidBaseTokenAddr(IERC20 invalidTokenAddr);

    /// Internal function to check if the token is base token
    /// @param s The token storage
    /// @param token The token to be checked
    function requireBaseToken(TokenStorage.Layout storage s, IERC20 token) internal view {
        (, AssetConfig memory assetConfig) = getValidToken(s, token);
        if (assetConfig.isTsbToken) revert InvalidBaseTokenAddr(token);
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
    /// @param token The token on Layer1
    /// @return tokenId The token id on Layer2
    /// @return assetConfig The configuration of the token
    function getValidToken(
        TokenStorage.Layout storage s,
        IERC20 token
    ) internal view returns (uint16, AssetConfig memory) {
        token = address(token) == address(AddressLib.getAddressStorage().getWETH())
            ? IERC20(Config.ETH_ADDRESS)
            : token;
        bool isTokenPaused = s.paused[token];
        if (isTokenPaused) revert TokenIsPaused(token);

        uint16 tokenId = getValidTokenId(s, token);
        AssetConfig memory assetConfig = s.assetConfigs[tokenId];
        return (tokenId, assetConfig);
    }

    /// @notice Internal function to get valid token id by l1 token
    /// @param s The token storage
    /// @param token The token on Layer1
    /// @return tokenId The token id on Layer2
    function getValidTokenId(TokenStorage.Layout storage s, IERC20 token) internal view returns (uint16) {
        uint16 tokenId = s.tokenIds[token];
        if (tokenId == 0) revert TokenIsNotExist(token);
        return tokenId;
    }

    /// @notice Internal function to get the configuration of the token by token id
    /// @param s The token storage
    /// @param tokenId The token id on Layer2
    /// @return assetConfig The configuration of the token
    function getAssetConfig(TokenStorage.Layout storage s, uint16 tokenId) internal view returns (AssetConfig memory) {
        return s.assetConfigs[tokenId];
    }

    /// @notice Internal function to get the configuration of the token by token
    /// @param s The token storage
    /// @param token The token on Layer1
    /// @return tokenId The token id on Layer2
    /// @return assetConfig The configuration of the token
    function getAssetConfig(
        TokenStorage.Layout storage s,
        IERC20 token
    ) internal view returns (uint16, AssetConfig memory) {
        uint16 tokenId = s.tokenIds[token];
        return (tokenId, s.assetConfigs[tokenId]);
    }

    /// @notice Internal function to get the Layer2 token id by token
    /// @param s The token storage
    /// @param token The token on Layer1
    /// @return tokenId The token id on Layer2
    function getTokenId(TokenStorage.Layout storage s, IERC20 token) internal view returns (uint16) {
        return s.tokenIds[token];
    }

    /// @notice Internal function to get the status of the token
    /// @param s The token storage
    /// @param token The token on Layer1
    /// @return isPaused The status of the token
    function isPaused(TokenStorage.Layout storage s, IERC20 token) internal view returns (bool) {
        return s.paused[token];
    }

    /// @notice Internal function to check if the deposit amount is valid
    /// @param depositAmt The deposit amount to be checked
    /// @param minDepositAmt The minimum deposit amount
    function validDepositAmt(uint128 depositAmt, uint128 minDepositAmt) internal pure {
        if (depositAmt < minDepositAmt) revert InvalidDepositAmt(depositAmt, minDepositAmt);
    }

    /// @notice Internal function to get the token storage layout
    /// @return tokenStorage The token storage layout
    function getTokenStorage() internal pure returns (TokenStorage.Layout storage) {
        return TokenStorage.layout();
    }
}
