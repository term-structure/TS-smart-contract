// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

library UpgradeMockStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTrueUp.contracts.storage.UpgradeMock")) - 1);

    struct Layout {
        uint256 value;
        address addr;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
