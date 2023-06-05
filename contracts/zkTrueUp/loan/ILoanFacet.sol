// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {LiquidationFactor, Loan} from "./LoanStorage.sol";

/**
 * @title Term Structure Loan Facet Interface
 */
interface ILoanFacet {
    /// @notice Error for setting invalid liquidation factor
    error InvalidLiquidationFactor();
    /// @notice Error for liquidate the loan which is safe
    error LoanIsSafe(uint256 healthFactor, uint32 maturityTime);
    /// @notice Error for liquidate the loan with invalid repay amount
    error RepayAmtExceedsMaxRepayAmt(uint128 repayAmt, uint128 maxRepayAmt);

    /// @notice Emitted when borrower add collateral
    /// @param loanId The id of the loan
    /// @param sender The address of the sender
    /// @param collateralTokenAddr The address of the collateral token
    /// @param addedCollateralAmt The amount of the added collateral
    event AddCollateral(
        bytes12 indexed loanId,
        address indexed sender,
        address collateralTokenAddr,
        uint128 addedCollateralAmt
    );

    /// @notice Emitted when borrower remove collateral
    /// @param loanId The id of the loan
    /// @param sender The address of the sender
    /// @param collateralTokenAddr The address of the collateral token
    /// @param removedCollateralAmt The amount of the removed collateral
    event RemoveCollateral(
        bytes12 indexed loanId,
        address indexed sender,
        address collateralTokenAddr,
        uint128 removedCollateralAmt
    );

    /// @notice Emitted when the borrower repay the loan
    /// @param loanId The id of the loan
    /// @param sender The address of the sender
    /// @param collateralTokenAddr The address of the collateral token
    /// @param debtTokenAddr The address of the debt token
    /// @param removedCollateralAmt The amount of the removed collateral
    /// @param removedDebtAmt The amount of the removed debt
    /// @param repayAndDeposit Whether to deposit the collateral after repay the loan
    event Repay(
        bytes12 indexed loanId,
        address indexed sender,
        address collateralTokenAddr,
        address debtTokenAddr,
        uint128 removedCollateralAmt,
        uint128 removedDebtAmt,
        bool repayAndDeposit
    );

    /// @notice Emitted when the loan is liquidated
    /// @param loanId The id of the loan
    /// @param liquidator The address of the liquidator
    /// @param collateralTokenAddr The address of the collateral token
    /// @param liquidatorReward The reward of the liquidator
    /// @param protocolPenalty The penalty of the protocol
    event Liquidation(
        bytes12 indexed loanId,
        address indexed liquidator,
        address collateralTokenAddr,
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
    /// @param repayAmt The amount of debt to be repaid
    /// @return liquidatorRewardAmt The amount of collateral to be returned to the liquidator
    /// @return protocolPenaltyAmt The amount of collateral to be returned to the protocol
    function liquidate(
        bytes12 loanId,
        uint128 repayAmt
    ) external payable returns (uint128 liquidatorRewardAmt, uint128 protocolPenaltyAmt);

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

    /// @notice Return the liquidation info of the loan
    /// @param loanId The id of the loan
    /// @return _isLiquidable Whether the loan is liquidable
    /// @return debtTokenAddr The address of the debt token
    /// @return maxRepayAmt The maximum amount of the debt to be repaid
    function getLiquidationInfo(
        bytes12 loanId
    ) external view returns (bool _isLiquidable, address debtTokenAddr, uint128 maxRepayAmt);
}
