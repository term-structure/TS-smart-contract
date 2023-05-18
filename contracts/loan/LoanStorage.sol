// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

library LoanStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTureUp.contracts.storage.Loan")) - 1);
    using LoanStorage for LoanStorage.Layout;

    function setHalfLiquidationThreshold(Layout storage l, uint16 halfLiquidationThreshold) internal {
        l.halfLiquidationThreshold = halfLiquidationThreshold;
    }

    function setFlashLoanPremium(Layout storage l, uint16 flashLoanPremium) internal {
        l.flashLoanPremium = flashLoanPremium;
    }

    function getHalfLiquidationThreshold(Layout storage l) internal view returns (uint16) {
        return l.halfLiquidationThreshold;
    }

    function getFlashLoanPremium(Layout storage l) internal view returns (uint16) {
        return l.flashLoanPremium;
    }

    struct Layout {
        /// @notice The half liquidation threshold
        uint16 halfLiquidationThreshold;
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
