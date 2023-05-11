// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

library AccountStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTureUp.contracts.storage.Account")) - 1);

    struct Layout {
        /// @notice Mode of evacuation (true: evacuation mode, false: normal mode)
        bool evacuMode;
        /// @notice Total number of registered accounts
        uint32 accountNum;
        /// @notice Mapping of L1 Address => L2 Account Id
        mapping(address => uint32) accountIds;
        /// @notice Mapping of L2 Account Id => L1 Address
        mapping(uint32 => address) accountAddres;
        /// @notice Mapping of L2 Account Id => L1 Address => isEvacuated
        mapping(uint32 => mapping(uint16 => bool)) evacuated;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
