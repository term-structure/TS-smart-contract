// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {TokenLib} from "../token/TokenLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {LoanStorage, Loan, LiquidationFactor} from "./LoanStorage.sol";
import {TokenStorage} from "../token/TokenStorage.sol";
import {Utils} from "../libraries/Utils.sol";
import {Config} from "../libraries/Config.sol";

/**
 * @title Term Structure Loan Library
 */
library LoanLib {
    using LoanLib for LoanStorage.Layout;
    using TokenLib for TokenStorage.Layout;

    /// @notice Error for collateral amount is not enough when removing collateral
    error CollateralAmtIsNotEnough(uint128 collateralAmt, uint128 amount);
    /// @notice Error for debt amount less than repay amount when repaying
    error DebtAmtLtRepayAmt(uint128 debtAmt, uint128 repayAmt);
    /// @notice Error for sender is not the loan owner
    error SenderIsNotLoanOwner(address sender, address loanOwner);
    /// @notice Error for health factor is under thresholds
    error LoanIsUnhealthy(uint256 healthFactor);
    /// @notice Error for get loan which is not exist
    error LoanIsNotExist();

    /// @notice Internal function to add collateral to the loan
    /// @param loan The loan to be added collateral
    /// @param amount The amount of the collateral to be added
    /// @return newLoan The new loan with added collateral
    function addCollateral(Loan memory loan, uint128 amount) internal pure returns (Loan memory) {
        loan.collateralAmt += amount;
        return loan;
    }

    /// @notice Internal function to remove collateral from the loan
    /// @param loan The loan to be removed collateral
    /// @param amount The amount of the collateral to be removed
    /// @return newLoan The new loan with removed collateral
    function removeCollateral(Loan memory loan, uint128 amount) internal pure returns (Loan memory) {
        if (loan.collateralAmt < amount) revert CollateralAmtIsNotEnough(loan.collateralAmt, amount);
        unchecked {
            loan.collateralAmt -= amount;
        }
        return loan;
    }

    /// @notice Internal function to repay the debt of the loan and remove collateral from the loan
    /// @param loan The loan to be repaid
    /// @param collateralAmt The amount of the collateral to be removed
    /// @param repayAmt The amount of the debt to be repaid
    /// @return newLoan The new loan with repaid debt and removed collateral
    function repay(Loan memory loan, uint128 collateralAmt, uint128 repayAmt) internal pure returns (Loan memory) {
        if (loan.collateralAmt < collateralAmt) revert CollateralAmtIsNotEnough(loan.collateralAmt, collateralAmt);
        if (loan.debtAmt < repayAmt) revert DebtAmtLtRepayAmt(loan.debtAmt, repayAmt);
        unchecked {
            loan.collateralAmt -= collateralAmt;
            loan.debtAmt -= repayAmt;
        }
        return loan;
    }

    /// @notice Internal function to update the loan
    /// @param loan The loan to be updated
    /// @param collateralAmt The amount of the collateral to be added
    /// @param debtAmt The amount of the debt to be added
    /// @return newLoan The new loan with updated collateral and debt
    function updateLoan(Loan memory loan, uint128 collateralAmt, uint128 debtAmt) internal pure returns (Loan memory) {
        loan.collateralAmt += collateralAmt;
        loan.debtAmt += debtAmt;
        return loan;
    }

    /// @notice Internal function to get the health factor of the loan
    /// @dev The health factor formula: ltvThreshold * (collateralValue / collateralDecimals) / (debtValue / debtDecimals)
    /// @dev The health factor decimals is 3
    /// @param loan The loan to be calculated
    /// @param ltvThreshold The LTV threshold of the loan
    /// @param collateralAsset The collateral asset of the loan
    /// @param debtAsset The debt asset of the loan
    /// @return healthFactor The health factor of the loan
    /// @return normalizedCollateralPrice The normalized price of the collateral asset
    /// @return normalizedDebtPrice The normalized price of the debt asset
    function getHealthFactor(
        Loan memory loan,
        uint256 ltvThreshold,
        AssetConfig memory collateralAsset,
        AssetConfig memory debtAsset
    ) internal view returns (uint256, uint256, uint256) {
        uint256 normalizedCollateralPrice = Utils.getPrice(collateralAsset.priceFeed);
        uint256 normalizedDebtPrice = Utils.getPrice(debtAsset.priceFeed);
        if (loan.debtAmt == 0) return (type(uint256).max, normalizedCollateralPrice, normalizedDebtPrice);

        // The health factor formula: ltvThreshold * collateralValue / debtValue
        // ==> healthFactor =
        //      ltvThreshold * (normalizedCollateralPrice * collateralAmt / 10**collateralDecimals) /
        //      (normalizedDebtPrice * loan.debtAmt / 10**debtDecimals)
        // ==> healthFactor =
        //      ltvThreshold * normalizedCollateralPrice * collateralAmt * 10**debtDecimals /
        //      (normalizedDebtPrice * loan.debtAmt) / 10**collateralDecimals
        uint256 healthFactor = (ltvThreshold *
            normalizedCollateralPrice *
            loan.collateralAmt *
            10 ** debtAsset.decimals) /
            (normalizedDebtPrice * loan.debtAmt) /
            10 ** collateralAsset.decimals;
        return (healthFactor, normalizedCollateralPrice, normalizedDebtPrice);
    }

    /// @notice Internal function to get the loan info
    /// @param s The loan storage
    /// @param loan The loan to be get its info
    /// @return liquidationFactor The liquidation factor of the loan
    /// @return collateralAsset The collateral asset of the loan
    /// @return debtAsset The debt asset of the loan
    function getLoanInfo(
        LoanStorage.Layout storage s,
        Loan memory loan
    ) internal view returns (LiquidationFactor memory, AssetConfig memory, AssetConfig memory) {
        if (loan.accountId == 0) revert LoanIsNotExist();
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        AssetConfig memory collateralAsset = tsl.getAssetConfig(loan.collateralTokenId);
        AssetConfig memory debtAsset = tsl.getAssetConfig(loan.debtTokenId);
        LiquidationFactor memory liquidationFactor = debtAsset.isStableCoin && collateralAsset.isStableCoin
            ? s.getStableCoinPairLiquidationFactor()
            : s.getLiquidationFactor();
        return (liquidationFactor, collateralAsset, debtAsset);
    }

    /// @notice Internal function to get the loan
    /// @param s The loan storage
    /// @param loanId The id of the loan
    /// @return loan The loan info
    function getLoan(LoanStorage.Layout storage s, bytes12 loanId) internal view returns (Loan memory) {
        return s.loans[loanId];
    }

    /// @notice Internal function to get the half liquidation threshold
    /// @param s The loan storage
    /// @return halfLiquidationThreshold The half liquidation threshold
    function getHalfLiquidationThreshold(LoanStorage.Layout storage s) internal view returns (uint16) {
        return s.halfLiquidationThreshold;
    }

    /// @notice Internal function to get the liquidation factor
    /// @param s The loan storage
    /// @return liquidationFactor The liquidation factor
    function getLiquidationFactor(LoanStorage.Layout storage s) internal view returns (LiquidationFactor memory) {
        return s.liquidationFactor;
    }

    /// @notice Internal function to get the stable coin pair liquidation factor
    /// @param s The loan storage
    /// @return liquidationFactor The stable coin pair liquidation factor
    function getStableCoinPairLiquidationFactor(
        LoanStorage.Layout storage s
    ) internal view returns (LiquidationFactor memory) {
        return s.stableCoinPairLiquidationFactor;
    }

    /// @notice Internal function to check if the roll function is activated
    /// @param s The loan storage
    /// @return isRollActivated True if the roll function is activated, otherwise false
    function getRollerState(LoanStorage.Layout storage s) internal view returns (bool) {
        return s.isActivatedRoller;
    }

    /// @notice Internal function to check if the loan is liquidable
    /// @param healthFactor The health factor of the loan
    /// @param maturityTime The maturity time of the loan
    /// @return isLiquidable True if the loan is liquidable, otherwise false
    function isLiquidable(uint256 healthFactor, uint32 maturityTime) internal view returns (bool) {
        return !isHealthy(healthFactor) || isMatured(maturityTime);
    }

    /// @notice Internal function to check if the loan is matured
    /// @param maturityTime The maturity time of the loan
    /// @return isMatured True if the loan is matured, otherwise false
    function isMatured(uint32 maturityTime) internal view returns (bool) {
        return block.timestamp >= maturityTime;
    }

    /// @notice Internal function to check if the loan is healthy
    /// @param healthFactor The health factor to be checked
    /// @return isHealthy True if the loan is healthy, otherwise false
    function isHealthy(uint256 healthFactor) internal pure returns (bool) {
        return healthFactor >= Config.HEALTH_FACTOR_THRESHOLD;
    }

    /// @notice Internal function to check if the sender is the loan owner
    /// @param sender The address of the sender
    /// @param loanOwner The address of the loan owner
    function senderIsLoanOwner(address sender, address loanOwner) internal pure {
        if (sender != loanOwner) revert SenderIsNotLoanOwner(sender, loanOwner);
    }

    /// @notice Internal function to check if the health factor is safe
    /// @param healthFactor The health factor to be checked
    function requireHealthy(uint256 healthFactor) internal pure {
        if (healthFactor < Config.HEALTH_FACTOR_THRESHOLD) revert LoanIsUnhealthy(healthFactor);
    }

    /// @notice Internal function to get the loan id by the loan info
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

    /// @notice Internal function to get the loan storage layout
    /// @return loanStorage The loan storage layout
    function getLoanStorage() internal pure returns (LoanStorage.Layout storage) {
        return LoanStorage.layout();
    }
}
