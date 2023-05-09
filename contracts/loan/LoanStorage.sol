// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

library LoanStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTureUp.contracts.storage.Loan")) - 1);

    /// @notice Liquidation factor of the loan
    struct LiquidationFactor {
        uint16 ltvThreshold;
        uint16 liquidatorIncentive;
        uint16 protocolPenalty;
    }

    /// @notice Data of loan
    struct Loan {
        uint32 accountId;
        uint32 maturityTime;
        uint16 collateralTokenId;
        uint16 debtTokenId;
        uint128 collateralAmt;
        uint128 debtAmt;
    }

    struct Layout {
        /// @notice The half liquidation threshold
        uint16 halfLiquidationThreshold;
        /// @notice The flash loan premium
        uint16 flashLoanPremium;
        /// @notice LTV threshold for loans
        LiquidationFactor liquidationFactor;
        /// @notice LTV threshold for stable coin pairs' loans
        LiquidationFactor stableCoinPairLiquidationFactor;
        /// @notice Mapping from loan id to loan data
        mapping(bytes12 => Loan) loans;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
