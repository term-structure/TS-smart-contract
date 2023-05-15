// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

library FlashLoanStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTureUp.contracts.storage.FlashLoan")) - 1);

    struct Layout {
        /// @notice The flash loan premium
        uint16 flashLoanPremium;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}