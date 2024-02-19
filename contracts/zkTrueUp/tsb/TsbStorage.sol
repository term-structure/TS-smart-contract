// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ITsbToken} from "../interfaces/ITsbToken.sol";

/* ============ The type hash of sign typed data v4 for permit functions ============ */

// redeem function type hash
bytes32 constant REDEEM_TYPEHASH = keccak256(
    "Redeem(address delegatee,address tsbToken,uint128 amount,bool redeemAndDeposit,uint256 nonce,uint256 deadline)"
);

/**
 * @title Term Structure Bond Storage
 * @author Term Structure Labs
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
