// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {TokenLib} from "../token/TokenLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {LoanStorage, Loan, LiquidationFactor} from "./LoanStorage.sol";
import {Utils} from "../libraries/Utils.sol";
import {Config} from "../libraries/Config.sol";

library LoanLib {
    /// @notice Error for sender is not the loan owner
    error SenderIsNotLoanOwner(address sender, address loanOwner);
    /// @notice Error for health factor is under thresholds
    error HealthFactorUnderThreshold(uint256 healthFactor);
    /// @notice Error for liquidate the loan which is healthy
    error LoanIsHealthy(uint256 healthFactor);
    /// @notice Error for get loan which is not exist
    error LoanIsNotExist();

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

    function loanIsLiquidable(uint256 healthFactor, uint32 maturityTime) internal view {
        if (healthFactor >= Config.HEALTH_FACTOR_THRESHOLD && maturityTime >= block.timestamp)
            revert LoanIsHealthy(healthFactor);
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
    /// @param loan The loan to be get its info
    /// @return liquidationFactor The liquidation factor of the loan
    /// @return collateralAsset The collateral asset of the loan
    /// @return debtAsset The debt asset of the loan
    function getLoanInfo(
        Loan memory loan
    ) internal view returns (LiquidationFactor memory, AssetConfig memory, AssetConfig memory) {
        if (loan.accountId == 0) revert LoanIsNotExist();
        AssetConfig memory collateralAsset = TokenLib.getAssetConfig(loan.collateralTokenId);
        AssetConfig memory debtAsset = TokenLib.getAssetConfig(loan.debtTokenId);
        LiquidationFactor memory liquidationFactor = debtAsset.isStableCoin && collateralAsset.isStableCoin
            ? LoanLib.getStableCoinPairLiquidationFactor()
            : LoanLib.getLiquidationFactor();
        return (liquidationFactor, collateralAsset, debtAsset);
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
