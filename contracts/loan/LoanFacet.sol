// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";
import {ILoanFacet} from "./ILoanFacet.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {GovernanceLib} from "../governance/GovernanceLib.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {TokenStorage, AssetConfig} from "../token/TokenStorage.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {LoanStorage, LiquidationFactor, Loan} from "./LoanStorage.sol";
import {LoanLib} from "./LoanLib.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {Config} from "../libraries/Config.sol";
import {Checker} from "../libraries/Checker.sol";

contract LoanFacet is ILoanFacet, AccessControlInternal, ReentrancyGuard {
    /// @notice Add collateral to the loan
    /// @dev Anyone can add collateral to the loan
    /// @param loanId The id of the loan
    /// @param amount The amount of the collateral
    function addCollateral(bytes12 loanId, uint128 amount) external payable {
        Loan memory loan = LoanLib.getLoan(loanId);
        (, AssetConfig memory collateralAsset, ) = _getLoanInfo(loan);
        loan.collateralAmt += amount;
        TokenLib.transferFrom(collateralAsset.tokenAddr, msg.sender, amount, msg.value);
        LoanStorage.layout().loans[loanId] = loan;
        emit AddCollateral(loanId, msg.sender, loan.collateralTokenId, amount);
    }

    /// @notice Remove collateral from the loan
    /// @param loanId The id of the loan
    /// @param amount The amount of the collateral
    function removeCollateral(bytes12 loanId, uint128 amount) external nonReentrant {
        Loan memory loan = LoanLib.getLoan(loanId);
        _senderIsLoanOwner(msg.sender, AccountLib.getAccountAddr(loan.accountId));
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = _getLoanInfo(loan);
        loan.collateralAmt -= amount;
        (uint256 healthFactor, , ) = _getHealthFactor(loan, liquidationFactor.ltvThreshold, collateralAsset, debtAsset);
        _safeHealthFactor(healthFactor);
        LoanStorage.layout().loans[loanId] = loan;
        TokenLib.transfer(collateralAsset.tokenAddr, payable(msg.sender), amount);
        emit RemoveCollateral(loanId, msg.sender, loan.collateralTokenId, amount);
    }

    /// @notice Repay the loan, only the loan owner can repay the loan
    /// @param loanId The id of the loan
    /// @param collateralAmt The amount of collateral to be returned
    /// @param debtAmt The amount of debt to be repaid
    /// @param repayAndDeposit Whether to deposit the collateral after repay the loan
    function repay(bytes12 loanId, uint128 collateralAmt, uint128 debtAmt, bool repayAndDeposit) external payable {
        Loan memory loan = LoanLib.getLoan(loanId);
        _senderIsLoanOwner(msg.sender, AccountLib.getAccountAddr(loan.accountId));
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = _getLoanInfo(loan);
        loan.debtAmt -= debtAmt;
        loan.collateralAmt -= collateralAmt;

        (uint256 healthFactor, , ) = _getHealthFactor(loan, liquidationFactor.ltvThreshold, collateralAsset, debtAsset);
        _safeHealthFactor(healthFactor);
        TokenLib.transferFrom(debtAsset.tokenAddr, msg.sender, debtAmt, msg.value);
        LoanStorage.layout().loans[loanId] = loan;
        emit Repay(
            loanId,
            msg.sender,
            loan.collateralTokenId,
            collateralAmt,
            loan.debtTokenId,
            debtAmt,
            repayAndDeposit
        );

        if (repayAndDeposit) {
            (uint16 tokenId, AssetConfig memory assetConfig) = TokenLib.getValidToken(collateralAsset.tokenAddr);
            TokenLib.validDepositAmt(collateralAmt, assetConfig);
            RollupLib.addDepositRequest(msg.sender, loan.accountId, tokenId, assetConfig.decimals, collateralAmt);
        } else {
            TokenLib.transfer(collateralAsset.tokenAddr, payable(msg.sender), collateralAmt);
        }
    }

    /// @notice Liquidate the loan
    /// @notice Liquidate the loan if the health factor is lower than the threshold or the loan is expired
    /// @notice Half liquidation will be triggered if the collateral value is larger than half liquidation threshold
    /// @notice The liquidator will repay the debt and get the collateral
    /// @param loanId The id of the loan to be liquidated
    /// @return repayAmt The amount of debt has been repaid
    /// @return liquidatorRewardAmt The amount of collateral to be returned to the liquidator
    /// @return protocolPenaltyAmt The amount of collateral to be returned to the protocol
    function liquidate(bytes12 loanId) external payable returns (uint128, uint128, uint128) {
        Loan memory loan = LoanLib.getLoan(loanId);
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = _getLoanInfo(loan);

        (uint128 repayAmt, uint128 liquidatorRewardAmt, uint128 protocolPenaltyAmt) = _liquidationCalculator(
            loan,
            collateralAsset,
            debtAsset,
            liquidationFactor
        );
        TokenLib.transferFrom(debtAsset.tokenAddr, msg.sender, repayAmt, msg.value);
        loan.debtAmt -= repayAmt;
        loan.collateralAmt -= (liquidatorRewardAmt + protocolPenaltyAmt);
        LoanStorage.layout().loans[loanId] = loan;
        TokenLib.transfer(collateralAsset.tokenAddr, payable(msg.sender), liquidatorRewardAmt);
        TokenLib.transfer(collateralAsset.tokenAddr, payable(GovernanceLib.getTreasuryAddr()), protocolPenaltyAmt);
        emit Liquidate(loanId, msg.sender, liquidatorRewardAmt, protocolPenaltyAmt);
        return (repayAmt, liquidatorRewardAmt, protocolPenaltyAmt);
    }

    /// @notice Get the health factor of the loan
    /// @param loanId The id of the loan
    /// @return healthFactor The health factor of the loan
    function getHealthFactor(bytes12 loanId) external view returns (uint256) {
        Loan memory loan = LoanLib.getLoan(loanId);
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = _getLoanInfo(loan);
        (uint256 healthFactor, , ) = _getHealthFactor(loan, liquidationFactor.ltvThreshold, collateralAsset, debtAsset);
        return healthFactor;
    }

    /// @notice Liquidation calculator to calculate the liquidator reward and protocol penalty
    /// @dev The three cases are:
    /// @dev 1. The collateral value is not enough to cover the full liquidator reward,
    /// @dev    then the liquidator reward will be the all collateral
    /// @dev 2. The collateral value is enough to cover the liquidator reward but not enough to cover the protocol penalty,
    /// @dev    then the liquidator reward is calculated by the liquidation factor,
    /// @dev    and the remaining collateral value will be the protocol penalty
    /// @dev 3. The collateral value is enough to cover the liquidator reward and protocol penalty,
    /// @dev    then the liquidator reward and protocol penalty are calculated by the liquidation factor,
    /// @dev    and the remaining collateral value will be returned to the borrower
    /// @param loan The loan to be liquidated
    /// @param collateralAsset The collateral asset config
    /// @param debtAsset The debt asset config
    /// @param liquidationFactor The liquidation factor
    /// @return repayAmt The amount of the debt to be repaid
    /// @return liquidatorRewardAmt The amount of the collateral to be rewarded to the liquidator
    /// @return protocolPenaltyAmt The amount of the collateral to be paid to the protocol
    function _liquidationCalculator(
        Loan memory loan,
        AssetConfig memory collateralAsset,
        AssetConfig memory debtAsset,
        LiquidationFactor memory liquidationFactor
    ) internal view returns (uint128, uint128, uint128) {
        (uint256 healthFactor, uint256 normalizedCollateralPrice, uint256 normalizedDebtPrice) = _getHealthFactor(
            loan,
            liquidationFactor.ltvThreshold,
            collateralAsset,
            debtAsset
        );
        if (healthFactor >= Config.HEALTH_FACTOR_THRESHOLD && loan.maturityTime >= block.timestamp)
            revert LoanIsHealthy(healthFactor);

        // if the collateral value is less than half liquidation threshold or the loan is expired,
        // then the liquidator will repay the full debt
        // otherwise, the liquidator will repay half of the debt
        uint128 repayAmt = (normalizedCollateralPrice * loan.collateralAmt) / 10 ** collateralAsset.decimals <
            uint256(LoanLib.getHalfLiquidationThreshold()) * 10 ** 18 ||
            loan.maturityTime < block.timestamp
            ? loan.debtAmt
            : loan.debtAmt / 2;

        uint256 normalizedRepayValue = (normalizedDebtPrice * repayAmt) / 10 ** debtAsset.decimals;

        // repayToCollateralRatio = LTV_BASE * repayValue / collateralValue
        // LTV_BASE = 1000
        // The repayValue and collateralValue are calculated by formula:
        // value = (normalizedPrice / 10**18) * (amount / 10**decimals)
        // ==> repayToCollateralRatio = (LTV_BASE * normalizedRepayValue / 10*18) / (normalizedCollateralPrice * collateralAmt / 10**18 / 10**collateralDecimals)
        // ==> repayToCollateralRatio = (LTV_BASE * normalizedRepayValue) * 10**collateralDecimals / normalizedCollateralPrice / collateralAmt
        uint256 repayToCollateralRatio = (Config.LTV_BASE * normalizedRepayValue * 10 ** collateralAsset.decimals) /
            normalizedCollateralPrice /
            loan.collateralAmt;

        // case1: if collateral value cannot cover protocol penalty and full liquidator reward
        // in this case, liquidator reward = all collateral, and protocol penalty = 0
        // liquidatorRewardAmt = totalCollateralAmt, and protocolPenaltyAmt = 0
        if (repayToCollateralRatio + liquidationFactor.liquidatorIncentive > Config.MAX_LTV_RATIO)
            return (repayAmt, loan.collateralAmt, 0);

        // To compute liquidator reward for case2 and case3: collateral value can cover full liquidator reward
        // The maxLtvRatio is a constant value = 1, and the decimals is 3
        // liquidatorReward = repayValue * (liquidatorIncentiveRatio + maxLtvRatio) / LTV_BASE
        // liquidatorRewardAmt = liquidatorReward equivalent in collateral asset
        // ==> liquidatorRewardAmt = ((liquidatorIncentiveRatio + maxLtvRatio) / LTV_BASE) *
        // (normalizedRepayValue / 1e18) * 10**collateralDecimals / (normalizedCollateralPrice / 1e18)
        // ==> liquidatorRewardAmt = (maxLtvRatio + liquidatorIncentiveRatio) * normalizedRepayValue *
        // 10**collateralDecimals / LTV_BASE / normalizedCollateralPrice
        uint128 liquidatorRewardAmt = uint128(
            ((Config.MAX_LTV_RATIO + liquidationFactor.liquidatorIncentive) *
                normalizedRepayValue *
                10 ** collateralAsset.decimals) /
                Config.LTV_BASE /
                normalizedCollateralPrice
        );

        // To compute protocol penalty for case2: collateral value can not cover full protocol penalty
        // protocolPenaltyAmt = totalCollateralAmt - liquidatorRewardAmt
        //
        // To compute protocol penalty for case3: collateral value can cover full protocol penalty
        // protocolPenalty = repayValue * protocolPenaltyRatio / LTV_BASE
        // protocolPenaltyAmt = protocolPenalty equivalent in collateral amount
        // ==> protocolPenaltyAmt = (protocolPenaltyRatio / LTV_BASE) * (normalizedRepayValue / 1e18) *
        // 10**collateralDecimals / (normalizedCollateralPrice / 1e18)
        // ==> protocolPenaltyAmt = protocolPenaltyRatio * normalizedRepayValue *
        // 10**collateralDecimals / LTV_BASE / normalizedCollateralPrice
        uint128 protocolPenaltyAmt;
        (repayToCollateralRatio + liquidationFactor.liquidatorIncentive + liquidationFactor.protocolPenalty) >
            Config.MAX_LTV_RATIO
            ? protocolPenaltyAmt = loan.collateralAmt - liquidatorRewardAmt
            : protocolPenaltyAmt = uint128(
            (liquidationFactor.protocolPenalty * normalizedRepayValue * 10 ** collateralAsset.decimals) /
                Config.LTV_BASE /
                normalizedCollateralPrice
        );
        return (repayAmt, liquidatorRewardAmt, protocolPenaltyAmt);
    }

    /// @notice Internal function to check if the sender is the loan owner
    /// @param sender The address of the sender
    /// @param loanOwner The address of the loan owner
    function _senderIsLoanOwner(address sender, address loanOwner) internal pure {
        if (sender != loanOwner) revert SenderIsNotLoanOwner(sender, loanOwner);
    }

    /// @notice Internal function to check if the health factor is safe
    /// @param healthFactor The health factor to be checked
    function _safeHealthFactor(uint256 healthFactor) internal pure {
        if (healthFactor < Config.HEALTH_FACTOR_THRESHOLD) revert HealthFactorUnderThreshold(healthFactor);
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
    function _getHealthFactor(
        Loan memory loan,
        uint256 ltvThreshold,
        AssetConfig memory collateralAsset,
        AssetConfig memory debtAsset
    ) internal view returns (uint256, uint256, uint256) {
        uint256 normalizedCollateralPrice = _getPrice(collateralAsset.priceFeed);
        uint256 normalizedDebtPrice = _getPrice(debtAsset.priceFeed);
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

    /// @notice Get the price of the token
    /// @dev The price is normalized to 18 decimals
    /// @param priceFeed The address of the price feed
    /// @return normalizedPirce The price with 18 decimals
    function _getPrice(address priceFeed) internal view returns (uint256) {
        Checker.noneZeroAddr(priceFeed);
        uint8 decimals = AggregatorV3Interface(priceFeed).decimals();
        (, int256 price, , , ) = AggregatorV3Interface(priceFeed).latestRoundData();
        if (price <= 0) revert InvalidPrice(price);
        return uint256(price) * 10 ** (18 - decimals);
    }

    /// @notice Internal function to get the loan info
    /// @param loan The loan to be get its info
    /// @return liquidationFactor The liquidation factor of the loan
    /// @return collateralAsset The collateral asset of the loan
    /// @return debtAsset The debt asset of the loan
    function _getLoanInfo(
        Loan memory loan
    ) internal view returns (LiquidationFactor memory, AssetConfig memory, AssetConfig memory) {
        if (loan.accountId == 0) revert LoanIsNotExist();
        AssetConfig memory collateralAsset = TokenLib.getAssetConfig(loan.collateralTokenId);
        AssetConfig memory debtAsset = TokenLib.getAssetConfig(loan.debtTokenId);
        LiquidationFactor memory liquidationFactor = debtAsset.isStableCoin && collateralAsset.isStableCoin
            ? LoanStorage.layout().stableCoinPairLiquidationFactor
            : LoanStorage.layout().liquidationFactor;
        return (liquidationFactor, collateralAsset, debtAsset);
    }

    /// @notice Set the half liquidation threshold
    /// @param halfLiquidationThreshold The half liquidation threshold
    function setHalfLiquidationThreshold(uint16 halfLiquidationThreshold) external onlyRole(Config.ADMIN_ROLE) {
        LoanStorage.layout().halfLiquidationThreshold = halfLiquidationThreshold;
        emit SetHalfLiquidationThreshold(halfLiquidationThreshold);
    }

    /// @notice Set the liquidation factor
    /// @param liquidationFactor The liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    function setLiquidationFactor(
        LiquidationFactor memory liquidationFactor,
        bool isStableCoinPair
    ) external onlyRole(Config.ADMIN_ROLE) {
        if (
            liquidationFactor.ltvThreshold == 0 ||
            liquidationFactor.ltvThreshold + liquidationFactor.liquidatorIncentive + liquidationFactor.protocolPenalty >
            Config.MAX_LTV_RATIO
        ) revert InvalidLiquidationFactor();
        isStableCoinPair
            ? LoanStorage.layout().stableCoinPairLiquidationFactor = liquidationFactor
            : LoanStorage.layout().liquidationFactor = liquidationFactor;
        emit SetLiquidationFactor(liquidationFactor, isStableCoinPair);
    }

    /// @notice Return the half liquidation threshold
    /// @return halfLiquidationThreshold The half liquidation threshold
    function getHalfLiquidationThreshold() external view returns (uint16) {
        return LoanStorage.layout().halfLiquidationThreshold;
    }

    /// @notice Return the liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    /// @return liquidationFactor The liquidation factor
    function getLiquidationFactor(bool isStableCoinPair) external view returns (LiquidationFactor memory) {
        return
            isStableCoinPair
                ? LoanStorage.layout().stableCoinPairLiquidationFactor
                : LoanStorage.layout().liquidationFactor;
    }

    /// @notice Return the loan id
    /// @param accountId The id of the account
    /// @param maturityTime The maturity time of the loan
    /// @param debtTokenId The id of the debt token
    /// @param collateralTokenId The id of the collateral token
    /// @return loanId The loan id
    function getLoanId(
        uint32 accountId,
        uint32 maturityTime,
        uint16 debtTokenId,
        uint16 collateralTokenId
    ) external pure returns (bytes12) {
        return LoanLib.getLoanId(accountId, maturityTime, debtTokenId, collateralTokenId);
    }

    /// @notice Return the loan info
    /// @param loanId The id of the loan
    /// @return loan The loan info
    function getLoan(bytes12 loanId) external view returns (Loan memory) {
        return LoanLib.getLoan(loanId);
    }
}
