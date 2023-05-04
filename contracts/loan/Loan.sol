// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {ILoan} from "./ILoan.sol";
import {LoanStorage} from "./LoanStorage.sol";
import {Config} from "../libs/Config.sol";

contract Loan is ILoan, AccessControlInternal {
    using LoanStorage for LoanStorage.Layout;

    /// @notice Set the half liquidation threshold
    /// @param halfLiquidationThreshold The half liquidation threshold
    function setHalfLiquidationThreshold(uint16 halfLiquidationThreshold) external onlyRole(Config.ADMIN_ROLE) {
        LoanStorage.layout().setHalfLiquidationThreshold(halfLiquidationThreshold);
        emit SetHalfLiquidationThreshold(halfLiquidationThreshold);
    }

    /// @notice Set the flash loan premium
    /// @param flashLoanPremium The flash loan premium
    function setFlashLoanPremium(uint16 flashLoanPremium) external onlyRole(Config.ADMIN_ROLE) {
        LoanStorage.layout().setFlashLoanPremium(flashLoanPremium);
        emit SetFlashLoanPremium(flashLoanPremium);
    }

    /// @notice Return the half liquidation threshold
    /// @return halfLiquidationThreshold The half liquidation threshold
    function getHalfLiquidationThreshold() external view returns (uint16) {
        return LoanStorage.layout().getHalfLiquidationThreshold();
    }

    /// @notice Return the flash loan premium
    /// @return flashLoanPremium The flash loan premium
    function getFlashLoanPremium() external view returns (uint16) {
        return LoanStorage.layout().getFlashLoanPremium();
    }
}
