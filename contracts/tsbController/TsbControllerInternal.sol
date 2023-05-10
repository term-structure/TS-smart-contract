// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {TsbControllerStorage} from "../tsbController/TsbControllerStorage.sol";

abstract contract TsbControllerInternal {
    function _getTsbTokenAddr(uint48 tsbTokenKey) internal view returns (address) {
        return TsbControllerStorage.layout().tsbTokens[tsbTokenKey];
    }

    /// @notice Internal function to get token key of the tsbToken
    /// @param underlyingTokenId The token id of the underlying asset
    /// @param maturityTime The maturity time of the tsbToken
    /// @return tsbTokenKey The key of the tsbTokens
    function _getTsbTokenKey(uint16 underlyingTokenId, uint32 maturityTime) internal pure returns (uint48) {
        return (uint48(underlyingTokenId) << 32) | maturityTime;
    }
}
