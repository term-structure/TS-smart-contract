// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LiquidationFactor, Loan} from "./LoanStorage.sol";

interface ILoanFacet {
    /// @notice Error for setting invalid liquidation factor
    error InvalidLiquidationFactor();

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

    /// @notice Add collateral to the loan
    /// @param loanId The id of the loan
    /// @param amount The amount of the collateral
    function addCollateral(bytes12 loanId, uint128 amount) external payable;

    /// @notice Remove collateral from the loan
    /// @param loanId The id of the loan
    /// @param amount The amount of the collateral
    function removeCollateral(bytes12 loanId, uint128 amount) external;

    /// @notice Repay the loan, only the loan owner can repay the loan
    /// @param loanId The id of the loan
    /// @param collateralAmt The amount of collateral to be returned
    /// @param debtAmt The amount of debt to be repaid
    /// @param repayAndDeposit Whether to deposit the collateral after repay the loan
    function repay(bytes12 loanId, uint128 collateralAmt, uint128 debtAmt, bool repayAndDeposit) external payable;

    /// @notice Liquidate the loan
    /// @param loanId The id of the loan to be liquidated
    /// @return repayAmt The amount of debt has been repaid
    /// @return liquidatorRewardAmt The amount of collateral to be returned to the liquidator
    /// @return protocolPenaltyAmt The amount of collateral to be returned to the protocol
    function liquidate(
        bytes12 loanId
    ) external payable returns (uint128 repayAmt, uint128 liquidatorRewardAmt, uint128 protocolPenaltyAmt);

    /// @notice Set the half liquidation threshold
    /// @param halfLiquidationThreshold The half liquidation threshold
    function setHalfLiquidationThreshold(uint16 halfLiquidationThreshold) external;

    /// @notice Set the liquidation factor
    /// @param liquidationFactor The liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    function setLiquidationFactor(LiquidationFactor memory liquidationFactor, bool isStableCoinPair) external;

    /// @notice Return the health factor of the loan
    /// @param loanId The id of the loan
    /// @return healthFactor The health factor of the loan
    function getHealthFactor(bytes12 loanId) external view returns (uint256 healthFactor);

    /// @notice Return the half liquidation threshold
    /// @return halfLiquidationThreshold The half liquidation threshold
    function getHalfLiquidationThreshold() external view returns (uint16 halfLiquidationThreshold);

    /// @notice Return the liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    /// @return liquidationFactor The liquidation factor
    function getLiquidationFactor(
        bool isStableCoinPair
    ) external view returns (LiquidationFactor memory liquidationFactor);

    /// @notice Return the loan id by the loan info
    /// @param accountId The id of the account
    /// @param maturityTime The maturity time of the loan
    /// @param debtTokenId The id of the debt token
    /// @param collateralTokenId The id of the collateral token
    /// @return loanId The id of the loan
    function getLoanId(
        uint32 accountId,
        uint32 maturityTime,
        uint16 debtTokenId,
        uint16 collateralTokenId
    ) external pure returns (bytes12 loanId);

    /// @notice Return the loan by the loan id
    /// @param loanId The id of the loan
    /// @return loan The loan
    function getLoan(bytes12 loanId) external view returns (Loan memory loan);
}
