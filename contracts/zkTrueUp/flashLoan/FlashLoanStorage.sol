// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title Term Structure Flash Loan Storage
 */
library FlashLoanStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTrueUp.contracts.storage.FlashLoan")) - 1);

    struct Layout {
        /// @notice The flash loan premium, base is 1e4 (10000)
        ///         i.e. 3 means 0.03% premium for flash loan
        uint16 flashLoanPremium;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
