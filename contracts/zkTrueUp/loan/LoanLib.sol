// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {AccountStorage} from "../account/AccountStorage.sol";
import {LoanStorage, Loan, LiquidationFactor, LoanInfo} from "./LoanStorage.sol";
import {RollupStorage} from "../rollup/RollupStorage.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {TokenStorage} from "../token/TokenStorage.sol";
import {Operations} from "../libraries/Operations.sol";
import {Utils} from "../libraries/Utils.sol";
import {Config} from "../libraries/Config.sol";

/**
 * @title Term Structure Loan Library
 * @author Term Structure Labs
 */
library LoanLib {
    using Math for uint256;
    using AccountLib for AccountStorage.Layout;
    using TokenLib for TokenStorage.Layout;
    using RollupLib for RollupStorage.Layout;
    using LoanLib for *;

    /// @notice Error for collateral amount is not enough when removing collateral
    error CollateralAmtIsNotEnough(uint128 collateralAmt, uint128 amount);
    /// @notice Error for locked collateral amount is not enough when removing locked collateral
    error LockedCollateralAmtIsNotEnough(uint128 lockedCollateralAmt, uint128 amount);
    /// @notice Error for debt amount less than repay amount when repaying
    error DebtAmtLtRepayAmt(uint128 debtAmt, uint128 repayAmt);
    /// @notice Error for addr is not the loan owner
    error isNotLoanOwner(address addr, address loanOwner);
    /// @notice Error for loan is not healthy (loan is liquidable)
    error LoanIsNotHealthy(uint256 healthFactor);
    /// @notice Error for loan is not strict healthy
    ///         (when place order, strict healthy is required to reserve some buffer to prevent users being liquidated immediately)
    error LoanIsNotStrictHealthy(uint256 healthFactor);
    /// @notice Error for get loan which is not exist
    error LoanIsNotExist(bytes12 loanId);
    /// @notice Error for collateral amount is less than locked collateral amount
    error CollateralAmtLtLockedCollateralAmt(uint128 collateralAmt, uint128 lockedCollateralAmt);
    /// @notice Error for invalid caller
    error InvalidCaller(address caller, address loanOwner);

    /// @notice Internal function to add collateral to the loan
    /// @param loan The loan to be added collateral
    /// @param amount The amount of the collateral to be added
    /// @return newLoan The new loan with added collateral
    function addCollateral(Loan memory loan, uint128 amount) internal pure returns (Loan memory) {
        loan.collateralAmt += amount;
        return loan;
    }

    /// @notice Internal function to remove collateral from the loan
    /// @dev The collateral amount must be greater than the locked collateral amount at any time
    /// @param loan The loan to be removed collateral
    /// @param amount The amount of the collateral to be removed
    /// @return newLoan The new loan with removed collateral
    function removeCollateral(Loan memory loan, uint128 amount) internal pure returns (Loan memory) {
        if (loan.collateralAmt < amount) revert CollateralAmtIsNotEnough(loan.collateralAmt, amount);

        unchecked {
            loan.collateralAmt -= amount;
        }

        // The collateral amount must be greater than the locked collateral amount at any time
        if (loan.collateralAmt < loan.lockedCollateralAmt)
            revert CollateralAmtLtLockedCollateralAmt(loan.collateralAmt, loan.lockedCollateralAmt);

        return loan;
    }

    /// @notice Internal function to remove locked collateral to the loan
    /// @dev The locked collateral amount must be greater than or equal to the removed amount
    /// @param loan The loan to be removed locked collateral
    /// @param amount The amount of the locked collateral to be removed
    function removeLockedCollateral(Loan memory loan, uint128 amount) internal pure returns (Loan memory) {
        if (loan.lockedCollateralAmt < amount) revert LockedCollateralAmtIsNotEnough(loan.lockedCollateralAmt, amount);

        unchecked {
            loan.lockedCollateralAmt -= amount;
        }

        return loan;
    }

    /// @notice Internal function to add roll borrow request in reuqest queue
    /// @param rsl The rollup storage
    /// @param sender The sender of the roll borrow request
    /// @param rollBorrowReq The roll borrow request to be added
    function addRollBorrowReq(
        RollupStorage.Layout storage rsl,
        address sender,
        Operations.RollBorrow memory rollBorrowReq
    ) internal {
        bytes memory pubData = Operations.encodeRollBorrowPubData(rollBorrowReq);
        rsl.addL1Request(sender, Operations.OpType.ROLL_BORROW_ORDER, pubData);
    }

    /// @notice Internal function to add force cancel roll borrow request in reuqest queue
    /// @param rsl The rollup storage
    /// @param sender The sender of the force cancel roll borrow request
    /// @param forceCancelRollBorrowReq The force cancel roll borrow request to be added
    function addForceCancelRollBorrowReq(
        RollupStorage.Layout storage rsl,
        address sender,
        Operations.CancelRollBorrow memory forceCancelRollBorrowReq
    ) internal {
        bytes memory pubData = Operations.encodeForceCancelRollBorrowPubData(forceCancelRollBorrowReq);
        rsl.addL1Request(sender, Operations.OpType.FORCE_CANCEL_ROLL_BORROW, pubData);
    }

    /// @notice Internal function to repay the debt of the loan and remove collateral from the loan
    /// @dev The collateral amount must be greater than the locked collateral amount at any time
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

        // The collateral amount must be greater than the locked collateral amount at any time
        if (loan.collateralAmt < loan.lockedCollateralAmt)
            revert CollateralAmtLtLockedCollateralAmt(loan.collateralAmt, loan.lockedCollateralAmt);

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
        // ==> healthFactor = ltvThreshold * normalizedCollateralValue / normalizedDebtValue
        uint256 normalizedCollateralValue = normalizedCollateralPrice.mulDiv(
            loan.collateralAmt,
            10 ** collateralAsset.decimals
        );
        uint256 normalizedDebtValue = normalizedDebtPrice.mulDiv(loan.debtAmt, 10 ** debtAsset.decimals);
        uint256 healthFactor = ltvThreshold.mulDiv(normalizedCollateralValue, normalizedDebtValue);
        return (healthFactor, normalizedCollateralPrice, normalizedDebtPrice);
    }

    /// @notice Internal function to get the loan info
    /// @param s The loan storage
    /// @param loanId The id of the loan
    /// @return LoanInfo The loan info
    function getLoanInfo(LoanStorage.Layout storage s, bytes12 loanId) internal view returns (LoanInfo memory) {
        Loan memory loan = s.getLoan(loanId);
        (uint32 accountId, uint32 maturityTime, uint16 debtTokenId, uint16 collateralTokenId) = resolveLoanId(loanId);
        if (accountId == 0) revert LoanIsNotExist(loanId);

        TokenStorage.Layout storage tsl = TokenStorage.layout();
        AssetConfig memory collateralAsset = tsl.getAssetConfig(collateralTokenId);
        AssetConfig memory debtAsset = tsl.getAssetConfig(debtTokenId);

        LiquidationFactor memory liquidationFactor = debtAsset.isStableCoin && collateralAsset.isStableCoin
            ? s.getStableCoinPairLiquidationFactor()
            : s.getLiquidationFactor();

        return (
            LoanInfo({
                loan: loan,
                accountId: accountId,
                maturityTime: maturityTime,
                liquidationFactor: liquidationFactor,
                collateralAsset: collateralAsset,
                debtAsset: debtAsset
            })
        );
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

    /// @notice Internal function to get the borrower fee rate
    /// @param s The loan storage
    /// @return borrowerFeeRate The borrower fee rate
    function getBorrowFeeRate(LoanStorage.Layout storage s) internal view returns (uint32) {
        return s.borrowerFeeRate;
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
        // solhint-disable-next-line not-rely-on-time
        return block.timestamp >= maturityTime;
    }

    /// @notice Internal function to check if the loan is healthy
    /// @param healthFactor The health factor to be checked
    /// @return isHealthy True if the loan is healthy, otherwise false
    function isHealthy(uint256 healthFactor) internal pure returns (bool) {
        return healthFactor >= Config.HEALTH_FACTOR_THRESHOLD;
    }

    /// @notice Internal function to check if the address is the loan owner
    /// @param addr The address to be checked
    /// @param accountId The account id
    function requireLoanOwner(address addr, uint32 accountId) internal view {
        address loanOwner = AccountStorage.layout().getAccountAddr(accountId);
        if (addr != loanOwner) revert isNotLoanOwner(addr, loanOwner);
    }

    function requireValidCaller(
        address caller,
        address loanOwner,
        mapping(address => mapping(address => bool)) storage isDelegated
    ) internal view {
        if (caller == loanOwner) return;
        if (isDelegated[loanOwner][caller]) return;
        revert InvalidCaller(caller, loanOwner);
    }

    /// @notice Internal function to check if the loan is healthy (not liquidable)
    /// @param loan The loan to be checked
    /// @param liquidationFactor The liquidation factor of the loan
    /// @param collateralAsset The collateral asset of the loan
    /// @param debtAsset The debt asset of the loan
    function requireHealthy(
        Loan memory loan,
        LiquidationFactor memory liquidationFactor,
        AssetConfig memory collateralAsset,
        AssetConfig memory debtAsset
    ) internal view {
        (uint256 healthFactor, , ) = loan.getHealthFactor(
            liquidationFactor.liquidationLtvThreshold, // use liquidation LTV threshold
            collateralAsset,
            debtAsset
        );
        if (healthFactor < Config.HEALTH_FACTOR_THRESHOLD) revert LoanIsNotHealthy(healthFactor);
    }

    /// @notice Internal function to check if the loan is strict healthy (buffering to liquidation threshold)
    /// @dev Using strict healthy when place order to reserve some buffer to prevent users being liquidated immediately
    /// @param loan The loan to be checked
    /// @param liquidationFactor The liquidation factor of the loan
    /// @param collateralAsset The collateral asset of the loan
    /// @param debtAsset The debt asset of the loan
    function requireStrictHealthy(
        Loan memory loan,
        LiquidationFactor memory liquidationFactor,
        AssetConfig memory collateralAsset,
        AssetConfig memory debtAsset
    ) internal view {
        (uint256 healthFactor, , ) = loan.getHealthFactor(
            liquidationFactor.borrowOrderLtvThreshold, // use borrow order LTV threshold
            collateralAsset,
            debtAsset
        );
        if (healthFactor < Config.HEALTH_FACTOR_THRESHOLD) revert LoanIsNotStrictHealthy(healthFactor);
    }

    /// @notice Return the max repayable amount of the loan
    /// @dev    If the collateral value is less than half liquidation threshold or the loan is expired,
    ///         then the liquidator can repay the all debt
    ///         otherwise, the liquidator can repay max to half of the debt
    /// @param collateralValue The collateral value without decimals
    /// @param debtAmt The amount of the debt
    /// @param halfLiquidationThreshold The value of half liquidation threshold
    /// @return maxRepayAmt The maximum amount of the debt to be repaid
    function calcMaxRepayAmt(
        uint256 collateralValue,
        uint128 debtAmt,
        uint32 maturityTime,
        uint16 halfLiquidationThreshold
    ) internal view returns (uint128) {
        uint128 maxRepayAmt = collateralValue < halfLiquidationThreshold || isMatured(maturityTime)
            ? debtAmt
            : debtAmt / 2;
        return maxRepayAmt;
    }

    /// @notice Internal function to calculate the collateral value
    /// @param normalizedCollateralPrice The normalized collateral price
    /// @param collateralAmt The collateral amount
    /// @param collateralDecimals The collateral decimals
    /// @return collateralValue The collateral value
    function calcCollateralValue(
        uint256 normalizedCollateralPrice,
        uint128 collateralAmt,
        uint8 collateralDecimals
    ) internal pure returns (uint256) {
        return normalizedCollateralPrice.mulDiv(collateralAmt, 10 ** collateralDecimals) / 10 ** 18;
    }

    /// @notice Internal function to get the loan id by the loan info
    /// @param accountId The account id
    /// @param maturityTime The maturity time
    /// @param debtTokenId The debt token id
    /// @param collateralTokenId The collateral token id
    /// @return loanId The loan id
    function calcLoanId(
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

    /// @notice Resolve the loan id
    /// @param loanId The loan id
    /// @return accountId The account id
    /// @return maturityTime The maturity time
    /// @return debtTokenId The debt token id
    /// @return collateralTokenId The collateral token id
    function resolveLoanId(bytes12 loanId) internal pure returns (uint32, uint32, uint16, uint16) {
        uint96 _loanId = uint96(loanId);
        return (uint32(_loanId >> 64), uint32(_loanId >> 32), uint16(_loanId >> 16), uint16(_loanId));
    }
}
