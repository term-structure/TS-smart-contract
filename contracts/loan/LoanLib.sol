// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LoanStorage, Loan, LiquidationFactor} from "./LoanStorage.sol";
import {Config} from "../libraries/Config.sol";

library LoanLib {
    /// @notice Error for sender is not the loan owner
    error SenderIsNotLoanOwner(address sender, address loanOwner);
    /// @notice Error for health factor is under thresholds
    error HealthFactorUnderThreshold(uint256 healthFactor);

    /// @notice Internal function to check if the sender is the loan owner
    /// @param sender The address of the sender
    /// @param loanOwner The address of the loan owner
    function senderIsLoanOwner(address sender, address loanOwner) internal pure {
        if (sender != loanOwner) revert SenderIsNotLoanOwner(sender, loanOwner);
    }

    /// @notice Internal function to check if the health factor is safe
    /// @param healthFactor The health factor to be checked
    function safeHealthFactor(uint256 healthFactor) internal pure {
        if (healthFactor < Config.HEALTH_FACTOR_THRESHOLD) revert HealthFactorUnderThreshold(healthFactor);
    }

    /// @notice Return the loan
    /// @param loanId The id of the loan
    /// @return loan The loan info
    function getLoan(bytes12 loanId) internal view returns (Loan memory) {
        return LoanStorage.layout().loans[loanId];
    }

    /// @notice Return half liquidation threshold
    /// @return halfLiquidationThreshold The half liquidation threshold
    function getHalfLiquidationThreshold() internal view returns (uint16) {
        return LoanStorage.layout().halfLiquidationThreshold;
    }

    function getLiquidationFactor() internal view returns (LiquidationFactor memory) {
        return LoanStorage.layout().liquidationFactor;
    }

    function getStableCoinPairLiquidationFactor() internal view returns (LiquidationFactor memory) {
        return LoanStorage.layout().stableCoinPairLiquidationFactor;
    }

    /// @notice Return the loan id
    /// @param accountId The account id
    /// @param maturityTime The maturity time
    /// @param debtTokenId The debt token id
    /// @param collateralTokenId The collateral token id
    /// @return loanId The loan id
    function getLoanId(
        uint32 accountId,
        uint32 maturityTime,
        uint16 debtTokenId,
        uint16 collateralTokenId
    ) internal pure returns (bytes12) {
        return
            bytes12(
                uint96(collateralTokenId) |
                    (uint96(debtTokenId) << 16) |
                    (uint96(maturityTime) << 32) |
                    (uint96(accountId) << 64)
            );
    }
}
