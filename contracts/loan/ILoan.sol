// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LoanStorage} from "./LoanStorage.sol";

interface ILoan {
    error InvalidLiquidationFactor();

    /// @notice Emitted when the half liquidation threshold is set
    /// @param halfLiquidationThreshold The half liquidation threshold
    event SetHalfLiquidationThreshold(uint16 indexed halfLiquidationThreshold);

    /// @notice Emitted when the flash loan premium is set
    /// @param flashLoanPremium The flash loan premium
    event SetFlashLoanPremium(uint16 indexed flashLoanPremium);

    /// @notice Emitted when the liquidation factor is set
    /// @param liquidationFactor The liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    event SetLiquidationFactor(LoanStorage.LiquidationFactor indexed liquidationFactor, bool indexed isStableCoinPair);

    /// @notice Set the half liquidation threshold
    /// @param halfLiquidationThreshold The half liquidation threshold
    function setHalfLiquidationThreshold(uint16 halfLiquidationThreshold) external;

    /// @notice Set the flash loan premium
    /// @param flashLoanPremium The flash loan premium
    function setFlashLoanPremium(uint16 flashLoanPremium) external;

    /// @notice Set the liquidation factor
    /// @param liquidationFactor The liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    function setLiquidationFactor(
        LoanStorage.LiquidationFactor memory liquidationFactor,
        bool isStableCoinPair
    ) external;

    /// @notice Return the half liquidation threshold
    /// @return halfLiquidationThreshold The half liquidation threshold
    function getHalfLiquidationThreshold() external view returns (uint16);

    /// @notice Return the flash loan premium
    /// @return flashLoanPremium The flash loan premium
    function getFlashLoanPremium() external view returns (uint16);

    /// @notice Return the liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    /// @return liquidationFactor The liquidation factor
    function getLiquidationFactor(bool isStableCoinPair) external view returns (LoanStorage.LiquidationFactor memory);
}
