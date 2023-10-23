// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title Term Structure Evacuation Storage
 * @author Term Structure Labs
 */
library EvacuationStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTrueUp.contracts.storage.Evacuation")) - 1);

    struct Layout {
        /// @notice Mode of evacuation (true: evacuation mode, false: normal mode)
        bool evacuMode;
        /// @notice Mapping of L2 Account Id => L2 Token Id => isEvacuated
        mapping(uint32 => mapping(uint16 => bool)) evacuated;
    }

    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            s.slot := slot
        }
    }
}
