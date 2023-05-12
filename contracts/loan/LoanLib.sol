// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LoanStorage, Loan, LiquidationFactor} from "./LoanStorage.sol";
import {Config} from "../libraries/Config.sol";

library LoanLib {
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
