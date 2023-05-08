// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {TokenStorage} from "./TokenStorage.sol";
import {ITokenInternal} from "./ITokenInternal.sol";
import {Config} from "../libraries/Config.sol";

abstract contract TokenInternal is ITokenInternal {
    using TokenStorage for TokenStorage.Layout;

    /// @notice Return the valid Layer2 token address and the configuration of the token
    /// @dev The L1 token address of a valid token cannot be 0 address and the token can not be paused
    /// @param tokenAddr The token address on Layer1
    /// @return tokenId The token id on Layer2
    /// @return assetConfig The configuration of the token
    function _getValidToken(
        address tokenAddr
    ) internal view returns (uint16 tokenId, TokenStorage.AssetConfig memory assetConfig) {
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        bool isPaused = tsl.getPaused(tokenAddr);
        if (isPaused) revert TokenIsPaused(tokenAddr);
        tokenId = _getValidTokenId(tokenAddr);
        assetConfig = tsl.getAssetConfig(tokenId);
    }

    /// @notice Get valid token id by l1 token address
    /// @param tokenAddr The token address on Layer1
    /// @return tokenId The token id on Layer2
    function _getValidTokenId(address tokenAddr) internal view returns (uint16 tokenId) {
        tokenId = TokenStorage.layout().getTokenId(tokenAddr);
        if (tokenId == 0) revert TokenIsNotExist(tokenAddr);
    }
}
