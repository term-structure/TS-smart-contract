// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ITsbToken} from "../interfaces/ITsbToken.sol";

/**
 * @title Term Structure Bond Storage
 */
library TsbStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTrueUp.contracts.storage.Tsb")) - 1);

    struct Layout {
        /// @notice Mapping of tsbTokenKey => tsbTokens
        /// tsbTokenKey = (uint48(underlyingTokenId) << 32) | uint32 maturity
        mapping(uint48 => ITsbToken) tsbTokens;
    }

    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            s.slot := slot
        }
    }
}
