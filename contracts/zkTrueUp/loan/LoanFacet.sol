// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {ILoanFacet} from "./ILoanFacet.sol";
import {GovernanceLib} from "../governance/GovernanceLib.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {LoanLib} from "./LoanLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {LoanStorage, LiquidationFactor, Loan} from "./LoanStorage.sol";
import {Config} from "../libraries/Config.sol";
import {Utils} from "../libraries/Utils.sol";

contract LoanFacet is ILoanFacet, AccessControlInternal, ReentrancyGuard {
    /**
     * @inheritdoc ILoanFacet
     * @dev Anyone can add collateral to the loan
     */
    function addCollateral(bytes12 loanId, uint128 amount) external payable {
        Loan memory loan = LoanLib.getLoan(loanId);
        (, AssetConfig memory collateralAsset, ) = LoanLib.getLoanInfo(loan);
        loan.collateralAmt += amount;
        Utils.transferFrom(collateralAsset.tokenAddr, msg.sender, amount, msg.value);
        LoanStorage.layout().loans[loanId] = loan;
        emit AddCollateral(loanId, msg.sender, loan.collateralTokenId, amount);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function removeCollateral(bytes12 loanId, uint128 amount) external nonReentrant {
        Loan memory loan = LoanLib.getLoan(loanId);
        LoanLib.senderIsLoanOwner(msg.sender, AccountLib.getAccountAddr(loan.accountId));
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = LoanLib.getLoanInfo(loan);
        loan.collateralAmt -= amount;
        (uint256 healthFactor, , ) = LoanLib.getHealthFactor(
            loan,
            liquidationFactor.ltvThreshold,
            collateralAsset,
            debtAsset
        );
        LoanLib.safeHealthFactor(healthFactor);
        LoanStorage.layout().loans[loanId] = loan;
        Utils.transfer(collateralAsset.tokenAddr, payable(msg.sender), amount);
        emit RemoveCollateral(loanId, msg.sender, loan.collateralTokenId, amount);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function repay(bytes12 loanId, uint128 collateralAmt, uint128 debtAmt, bool repayAndDeposit) external payable {
        Loan memory loan = LoanLib.getLoan(loanId);
        LoanLib.senderIsLoanOwner(msg.sender, AccountLib.getAccountAddr(loan.accountId));
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = LoanLib.getLoanInfo(loan);
        loan.debtAmt -= debtAmt;
        loan.collateralAmt -= collateralAmt;

        (uint256 healthFactor, , ) = LoanLib.getHealthFactor(
            loan,
            liquidationFactor.ltvThreshold,
            collateralAsset,
            debtAsset
        );
        LoanLib.safeHealthFactor(healthFactor);
        Utils.transferFrom(debtAsset.tokenAddr, msg.sender, debtAmt, msg.value);
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
            AccountLib.addDepositReq(msg.sender, loan.accountId, tokenId, assetConfig.decimals, collateralAmt);
        } else {
            Utils.transfer(collateralAsset.tokenAddr, payable(msg.sender), collateralAmt);
        }
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function liquidate(bytes12 loanId) external payable returns (uint128, uint128, uint128) {
        Loan memory loan = LoanLib.getLoan(loanId);
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = LoanLib.getLoanInfo(loan);

        (uint128 repayAmt, uint128 liquidatorRewardAmt, uint128 protocolPenaltyAmt) = _liquidationCalculator(
            loan,
            collateralAsset,
            debtAsset,
            liquidationFactor
        );
        Utils.transferFrom(debtAsset.tokenAddr, msg.sender, repayAmt, msg.value);
        loan.debtAmt -= repayAmt;
        loan.collateralAmt -= (liquidatorRewardAmt + protocolPenaltyAmt);
        LoanStorage.layout().loans[loanId] = loan;
        Utils.transfer(collateralAsset.tokenAddr, payable(msg.sender), liquidatorRewardAmt);
        Utils.transfer(collateralAsset.tokenAddr, payable(GovernanceLib.getTreasuryAddr()), protocolPenaltyAmt);
        emit Liquidate(loanId, msg.sender, liquidatorRewardAmt, protocolPenaltyAmt);
        return (repayAmt, liquidatorRewardAmt, protocolPenaltyAmt);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function setHalfLiquidationThreshold(uint16 halfLiquidationThreshold) external onlyRole(Config.ADMIN_ROLE) {
        LoanStorage.layout().halfLiquidationThreshold = halfLiquidationThreshold;
        emit SetHalfLiquidationThreshold(halfLiquidationThreshold);
    }

    /**
     * @inheritdoc ILoanFacet
     */
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

    /**
     * @inheritdoc ILoanFacet
     */
    function getHealthFactor(bytes12 loanId) external view returns (uint256 healthFactor) {
        Loan memory loan = LoanLib.getLoan(loanId);
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = LoanLib.getLoanInfo(loan);
        (healthFactor, , ) = LoanLib.getHealthFactor(loan, liquidationFactor.ltvThreshold, collateralAsset, debtAsset);
        return healthFactor;
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getHalfLiquidationThreshold() external view returns (uint16 halfLiquidationThreshold) {
        return LoanLib.getHalfLiquidationThreshold();
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getLiquidationFactor(
        bool isStableCoinPair
    ) external view returns (LiquidationFactor memory liquidationFactor) {
        return isStableCoinPair ? LoanLib.getStableCoinPairLiquidationFactor() : LoanLib.getLiquidationFactor();
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getLoanId(
        uint32 accountId,
        uint32 maturityTime,
        uint16 debtTokenId,
        uint16 collateralTokenId
    ) external pure returns (bytes12 loanId) {
        return LoanLib.getLoanId(accountId, maturityTime, debtTokenId, collateralTokenId);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getLoan(bytes12 loanId) external view returns (Loan memory loan) {
        return LoanLib.getLoan(loanId);
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
        (uint256 healthFactor, uint256 normalizedCollateralPrice, uint256 normalizedDebtPrice) = LoanLib
            .getHealthFactor(loan, liquidationFactor.ltvThreshold, collateralAsset, debtAsset);
        LoanLib.loanIsLiquidable(healthFactor, loan.maturityTime);

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
}
