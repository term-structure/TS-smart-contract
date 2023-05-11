// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

library TsbStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTureUp.contracts.storage.Tsb")) - 1);

    struct Layout {
        /// @notice Mapping of tsbTokenKey => tsbTokens
        /// tsbTokenKey = (uint48(underlyingTokenId) << 32) | uint32 maturity
        mapping(uint48 => address) tsbTokens;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
