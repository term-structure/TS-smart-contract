// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LoanStorage, LiquidationFactor} from "./LoanStorage.sol";

interface ILoanFacet {
    error InvalidLiquidationFactor();
    /// @notice Error for get loan which is not exist
    error LoanIsNotExist();
    /// @notice Error for sender is not the loan owner
    error SenderIsNotLoanOwner(address sender, address loanOwner);
    /// @notice Error for health factor is under thresholds
    error HealthFactorUnderThreshold(uint256 healthFactor);
    /// @notice Error for get invalid price
    error InvalidPrice(int256 price);
    /// @notice Error for liquidate the loan which is healthy
    error LoanIsHealthy(uint256 healthFactor);

    /// @notice Emitted when borrower add collateral
    /// @param loanId The id of the loan
    /// @param sender The address of the sender
    /// @param collateralTokenId The id of the collateral token
    /// @param collateralAmt The amount of the collateral
    event AddCollateral(
        bytes12 indexed loanId,
        address indexed sender,
        uint16 collateralTokenId,
        uint128 collateralAmt
    );

    /// @notice Emitted when borrower remove collateral
    /// @param loanId The id of the loan
    /// @param sender The address of the sender
    /// @param collateralTokenId The id of the collateral token
    /// @param collateralAmt The amount of the collateral
    event RemoveCollateral(
        bytes12 indexed loanId,
        address indexed sender,
        uint16 collateralTokenId,
        uint128 collateralAmt
    );

    /// @notice Emitted when the borrower repay the loan
    /// @param loanId The id of the loan
    /// @param sender The address of the sender
    /// @param collateralTokenId The id of the collateral token
    /// @param collateralAmt The amount of collateral to be returned
    /// @param debtTokenId The id of the debt token
    /// @param debtAmt The amount of debt to be repaid
    /// @param repayAndDeposit Whether to deposit the collateral after repay the loan
    event Repay(
        bytes12 indexed loanId,
        address indexed sender,
        uint16 collateralTokenId,
        uint128 collateralAmt,
        uint16 debtTokenId,
        uint128 debtAmt,
        bool repayAndDeposit
    );

    /// @notice Emitted when the loan is liquidated
    /// @param loanId The id of the loan
    /// @param liquidator The address of the liquidator
    /// @param liquidatorReward The reward of the liquidator
    /// @param protocolPenalty The penalty of the protocol
    event Liquidate(
        bytes12 indexed loanId,
        address indexed liquidator,
        uint128 liquidatorReward,
        uint128 protocolPenalty
    );

    /// @notice Emitted when the half liquidation threshold is set
    /// @param halfLiquidationThreshold The half liquidation threshold
    event SetHalfLiquidationThreshold(uint16 indexed halfLiquidationThreshold);

    /// @notice Emitted when the flash loan premium is set
    /// @param flashLoanPremium The flash loan premium
    event SetFlashLoanPremium(uint16 indexed flashLoanPremium);

    /// @notice Emitted when the liquidation factor is set
    /// @param liquidationFactor The liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    event SetLiquidationFactor(LiquidationFactor indexed liquidationFactor, bool indexed isStableCoinPair);

    /// @notice Set the half liquidation threshold
    /// @param halfLiquidationThreshold The half liquidation threshold
    function setHalfLiquidationThreshold(uint16 halfLiquidationThreshold) external;

    /// @notice Set the liquidation factor
    /// @param liquidationFactor The liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    function setLiquidationFactor(LiquidationFactor memory liquidationFactor, bool isStableCoinPair) external;

    /// @notice Return the half liquidation threshold
    /// @return halfLiquidationThreshold The half liquidation threshold
    function getHalfLiquidationThreshold() external view returns (uint16);

    /// @notice Return the liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    /// @return liquidationFactor The liquidation factor
    function getLiquidationFactor(bool isStableCoinPair) external view returns (LiquidationFactor memory);
}
