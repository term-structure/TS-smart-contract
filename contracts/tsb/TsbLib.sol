// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {TsbStorage} from "./TsbStorage.sol";

library TsbLib {
    /// @notice Error for redeem with tsb token which is not matured
    error TsbTokenIsNotMatured(address tsbTokenAddr);

    /// @notice Emitted when a TSB token is minted
    /// @param tsbTokenAddr The address of the minted TSB token
    /// @param accountAddr The L1 address of the minted TSB token
    /// @param amount The amount of the minted TSB token
    event TsbTokenMinted(address indexed tsbTokenAddr, address indexed accountAddr, uint256 amount);

    /// @notice Emitted when a TSB token is burned
    /// @param tsbTokenAddr The address of the burned TSB token
    /// @param accountAddr The L1 address of the burned TSB token
    /// @param amount The amount of the burned TSB token
    event TsbTokenBurned(address indexed tsbTokenAddr, address indexed accountAddr, uint256 amount);

    function requireMatured(address tsbTokenAddr, uint32 maturityTime) internal view {
        if (block.timestamp < maturityTime) revert TsbTokenIsNotMatured(tsbTokenAddr);
    }

    /// @notice Mint tsbToken
    /// @dev This function can only be called by zkTrueUp
    /// @param tsbTokenAddr The address of the tsbToken
    /// @param to The address of the recipient
    /// @param amount The amount of the tsbToken
    function mintTsbToken(address tsbTokenAddr, address to, uint128 amount) internal {
        ITsbToken(tsbTokenAddr).mint(to, amount);
        emit TsbTokenMinted(tsbTokenAddr, to, amount);
    }

    /// @notice Burn tsbToken
    /// @dev This function can only be called by zkTrueUp
    /// @param tsbTokenAddr The address of the tsbToken
    /// @param from The address of the sender
    /// @param amount The amount of the tsbToken to burn
    function burnTsbToken(address tsbTokenAddr, address from, uint128 amount) internal {
        ITsbToken(tsbTokenAddr).burn(from, amount);
        emit TsbTokenBurned(tsbTokenAddr, from, amount);
    }

    function getTsbTokenAddr(uint48 tsbTokenKey) internal view returns (address) {
        return TsbStorage.layout().tsbTokens[tsbTokenKey];
    }

    /// @notice Internal function to get token key of the tsbToken
    /// @param underlyingTokenId The token id of the underlying asset
    /// @param maturityTime The maturity time of the tsbToken
    /// @return tsbTokenKey The key of the tsbTokens
    function getTsbTokenKey(uint16 underlyingTokenId, uint32 maturityTime) internal pure returns (uint48) {
        return (uint48(underlyingTokenId) << 32) | maturityTime;
    }
}
