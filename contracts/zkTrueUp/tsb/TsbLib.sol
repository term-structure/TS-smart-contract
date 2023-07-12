// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {TsbStorage} from "./TsbStorage.sol";

/**
 * @title Term Structure Bond Library
 */
library TsbLib {
    /// @notice Error for redeem with tsb token which is not matured
    error TsbTokenIsNotMatured(ITsbToken tsbToken);

    /// @notice Emitted when a TSB token is minted
    /// @param tsbToken The tsbToken to be minted
    /// @param accountAddr The L1 address of the minted TSB token
    /// @param amount The amount of the minted TSB token
    event TsbTokenMinted(ITsbToken indexed tsbToken, address indexed accountAddr, uint256 amount);

    /// @notice Emitted when a TSB token is burned
    /// @param tsbToken The tsbToken to be burned
    /// @param accountAddr The L1 address of the burned TSB token
    /// @param amount The amount of the burned TSB token
    event TsbTokenBurned(ITsbToken indexed tsbToken, address indexed accountAddr, uint256 amount);

    /// @notice Internal  function to check whether the tsbToken is matured
    /// @param tsbToken The tsbToken to be checked
    /// @param maturityTime The maturity time of the tsbToken
    function requireMatured(ITsbToken tsbToken, uint32 maturityTime) internal view {
        if (block.timestamp < maturityTime) revert TsbTokenIsNotMatured(tsbToken);
    }

    /// @notice Mint tsbToken
    /// @dev This function can only be called by zkTrueUp
    /// @param tsbToken The tsbToken to be minted
    /// @param to The address of the recipient
    /// @param amount The amount of the tsbToken
    function mintTsbToken(ITsbToken tsbToken, address to, uint256 amount) internal {
        tsbToken.mint(to, amount);
        emit TsbTokenMinted(tsbToken, to, amount);
    }

    /// @notice Burn tsbToken
    /// @dev This function can only be called by zkTrueUp
    /// @param tsbToken The tsbToken to be burned
    /// @param from The address of the sender
    /// @param amount The amount of the tsbToken to burn
    function burnTsbToken(ITsbToken tsbToken, address from, uint256 amount) internal {
        tsbToken.burn(from, amount);
        emit TsbTokenBurned(tsbToken, from, amount);
    }

    /// @notice Internal function to get the tsbToken
    /// @param s The Tsb storage
    /// @param tsbTokenKey The key of the tsbToken
    /// @return tsbToken The tsbToken of the tsbTokenKey
    function getTsbToken(TsbStorage.Layout storage s, uint48 tsbTokenKey) internal view returns (ITsbToken) {
        return s.tsbTokens[tsbTokenKey];
    }

    /// @notice Internal function to get token key of the tsbToken
    /// @param underlyingTokenId The token id of the underlying asset
    /// @param maturityTime The maturity time of the tsbToken
    /// @return tsbTokenKey The key of the tsbTokens
    function getTsbTokenKey(uint16 underlyingTokenId, uint32 maturityTime) internal pure returns (uint48) {
        return (uint48(underlyingTokenId) << 32) | maturityTime;
    }
}
