// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {ILoan} from "./ILoan.sol";
import {LoanStorage} from "./LoanStorage.sol";
import {Config} from "../libraries/Config.sol";

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

    /// @notice Set the liquidation factor
    /// @param liquidationFactor The liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    function setLiquidationFactor(
        LoanStorage.LiquidationFactor memory liquidationFactor,
        bool isStableCoinPair
    ) external onlyRole(Config.ADMIN_ROLE) {
        if (
            liquidationFactor.ltvThreshold == 0 ||
            liquidationFactor.ltvThreshold + liquidationFactor.liquidatorIncentive + liquidationFactor.protocolPenalty >
            Config.MAX_LTV_RATIO
        ) revert InvalidLiquidationFactor();
        isStableCoinPair
            ? LoanStorage.layout().setStableCoinPairLiquidationFactor(liquidationFactor)
            : LoanStorage.layout().setLiquidationFactor(liquidationFactor);
        emit SetLiquidationFactor(liquidationFactor, isStableCoinPair);
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

    /// @notice Return the liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    /// @return liquidationFactor The liquidation factor
    function getLiquidationFactor(bool isStableCoinPair) external view returns (LoanStorage.LiquidationFactor memory) {
        return
            isStableCoinPair
                ? LoanStorage.layout().getStableCoinPairLiquidationFactor()
                : LoanStorage.layout().getLiquidationFactor();
    }
}
