// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {ISolidStateERC20} from "@solidstate/contracts/token/ERC20/ISolidStateERC20.sol";
import {SafeERC20} from "@solidstate/contracts/utils/SafeERC20.sol";
import {AccountStorage} from "../account/AccountStorage.sol";
import {AddressStorage} from "../address/AddressStorage.sol";
import {ProtocolParamsStorage} from "../protocolParams/ProtocolParamsStorage.sol";
import {TokenStorage} from "../token/TokenStorage.sol";
import {IPool} from "../interfaces/aaveV3/IPool.sol";
import {ILoanFacet} from "./ILoanFacet.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {ProtocolParamsLib} from "../protocolParams/ProtocolParamsLib.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {LoanLib} from "./LoanLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {LoanStorage, LiquidationFactor, Loan, LiquidationAmt} from "./LoanStorage.sol";
import {Config} from "../libraries/Config.sol";
import {Utils} from "../libraries/Utils.sol";

import "hardhat/console.sol";

/**
 * @title Term Structure Loan Facet Contract
 */
contract LoanFacet is ILoanFacet, AccessControlInternal, ReentrancyGuard {
    using SafeERC20 for ISolidStateERC20;
    using AccountLib for AccountStorage.Layout;
    using AddressLib for AddressStorage.Layout;
    using ProtocolParamsLib for ProtocolParamsStorage.Layout;
    using TokenLib for TokenStorage.Layout;
    using LoanLib for *;

    /**
     * @inheritdoc ILoanFacet
     * @dev Anyone can add collateral to the loan
     */
    function addCollateral(bytes12 loanId, uint128 amount) external payable {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        Loan memory loan = lsl.getLoan(loanId);
        (, AssetConfig memory collateralAsset, ) = lsl.getLoanInfo(loan);
        Utils.transferFrom(collateralAsset.tokenAddr, msg.sender, amount, msg.value);

        loan = loan.addCollateral(amount);
        lsl.loans[loanId] = loan;
        emit AddCollateral(loanId, msg.sender, collateralAsset.tokenAddr, amount);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function removeCollateral(bytes12 loanId, uint128 amount) external nonReentrant {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        Loan memory loan = lsl.getLoan(loanId);
        LoanLib.senderIsLoanOwner(msg.sender, AccountLib.getAccountStorage().getAccountAddr(loan.accountId));
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = lsl.getLoanInfo(loan);

        loan = loan.removeCollateral(amount);

        (uint256 healthFactor, , ) = LoanLib.getHealthFactor(
            loan,
            liquidationFactor.ltvThreshold,
            collateralAsset,
            debtAsset
        );
        LoanLib.requireHealthy(healthFactor);

        lsl.loans[loanId] = loan;
        Utils.transfer(collateralAsset.tokenAddr, payable(msg.sender), amount);
        emit RemoveCollateral(loanId, msg.sender, collateralAsset.tokenAddr, amount);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function repay(bytes12 loanId, uint128 collateralAmt, uint128 debtAmt, bool repayAndDeposit) external payable {
        (address collateralToken, uint32 accountId) = _repay(loanId, collateralAmt, debtAmt, repayAndDeposit);

        if (repayAndDeposit) {
            (uint16 tokenId, AssetConfig memory assetConfig) = TokenLib.getTokenStorage().getValidToken(
                collateralToken
            );
            TokenLib.validDepositAmt(collateralAmt, assetConfig);
            AccountLib.addDepositReq(
                RollupLib.getRollupStorage(),
                msg.sender,
                accountId,
                assetConfig.tokenAddr,
                tokenId,
                assetConfig.decimals,
                collateralAmt
            );
        } else {
            Utils.transfer(collateralToken, payable(msg.sender), collateralAmt);
        }
    }

    /**
     * @inheritdoc ILoanFacet
     * @notice Should be `approveDelegation` before `borrow from AAVE V3 pool`
     * @dev Roll the loan to AAVE V3 pool,
     *      the user can transfer the loan of fixed rate and date from term structure
     *      to the floating rate and perpetual position on Aave without repaying the debt
     */
    function rollToAave(bytes12 loanId, uint128 collateralAmt, uint128 debtAmt) external {
        LoanStorage.Layout storage lsl = LoanLib.getLoanStorage();
        bool isActivated = lsl.getRollerState();
        if (!isActivated) revert RollIsNotActivated();

        Loan memory loan = lsl.getLoan(loanId);
        LoanLib.senderIsLoanOwner(msg.sender, AccountLib.getAccountStorage().getAccountAddr(loan.accountId));
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = lsl.getLoanInfo(loan);

        loan = loan.repay(collateralAmt, debtAmt);

        (uint256 healthFactor, , ) = LoanLib.getHealthFactor(
            loan,
            liquidationFactor.ltvThreshold,
            collateralAsset,
            debtAsset
        );
        LoanLib.requireHealthy(healthFactor);

        lsl.loans[loanId] = loan;

        _supplyToBorrow(loanId, collateralAsset.tokenAddr, debtAsset.tokenAddr, collateralAmt, debtAmt);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function liquidate(bytes12 loanId, uint128 repayAmt) external payable returns (uint128, uint128) {
        (LiquidationAmt memory liquidationAmt, address collateralToken) = _liquidate(loanId, repayAmt);

        uint128 liquidatorRewardAmt = liquidationAmt.liquidatorRewardAmt;
        uint128 protocolPenaltyAmt = liquidationAmt.protocolPenaltyAmt;
        Utils.transfer(collateralToken, payable(msg.sender), liquidatorRewardAmt);
        address payable treasuryAddr = ProtocolParamsLib.getProtocolParamsStorage().getTreasuryAddr();
        Utils.transfer(collateralToken, treasuryAddr, protocolPenaltyAmt);
        emit Liquidation(loanId, msg.sender, collateralToken, liquidatorRewardAmt, protocolPenaltyAmt);
        return (liquidatorRewardAmt, protocolPenaltyAmt);
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
    function setIsActivatedRoller(bool isActivated) external onlyRole(Config.ADMIN_ROLE) {
        LoanStorage.layout().isActivatedRoller = isActivated;
        emit SetIsActivatedRoller(isActivated);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getHealthFactor(bytes12 loanId) external view returns (uint256) {
        LoanStorage.Layout storage lsl = LoanLib.getLoanStorage();
        Loan memory loan = lsl.getLoan(loanId);
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = lsl.getLoanInfo(loan);
        (uint256 healthFactor, , ) = LoanLib.getHealthFactor(
            loan,
            liquidationFactor.ltvThreshold,
            collateralAsset,
            debtAsset
        );
        return healthFactor;
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getHalfLiquidationThreshold() external view returns (uint16) {
        return LoanLib.getLoanStorage().getHalfLiquidationThreshold();
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getLiquidationFactor(bool isStableCoinPair) external view returns (LiquidationFactor memory) {
        LoanStorage.Layout storage lsl = LoanLib.getLoanStorage();
        return isStableCoinPair ? lsl.getStableCoinPairLiquidationFactor() : lsl.getLiquidationFactor();
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getLoanId(
        uint32 accountId,
        uint32 maturityTime,
        uint16 debtTokenId,
        uint16 collateralTokenId
    ) external pure returns (bytes12) {
        return LoanLib.getLoanId(accountId, maturityTime, debtTokenId, collateralTokenId);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getLoan(bytes12 loanId) external view returns (Loan memory) {
        return LoanLib.getLoanStorage().getLoan(loanId);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getLiquidationInfo(bytes12 loanId) external view returns (bool, address, uint128) {
        LoanStorage.Layout storage lsl = LoanLib.getLoanStorage();
        Loan memory loan = lsl.getLoan(loanId);
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = lsl.getLoanInfo(loan);
        (uint256 healthFactor, uint256 normalizedCollateralPrice, ) = LoanLib.getHealthFactor(
            loan,
            liquidationFactor.ltvThreshold,
            collateralAsset,
            debtAsset
        );
        bool _isLiquidable = LoanLib.isLiquidable(healthFactor, loan.maturityTime);
        uint256 collateralValue = _calcCollateralValue(
            normalizedCollateralPrice,
            loan.collateralAmt,
            collateralAsset.decimals
        );
        uint16 halfLiquidationThreshold = lsl.getHalfLiquidationThreshold();
        uint128 maxRepayAmt = _getMaxRepayAmt(halfLiquidationThreshold, loan, collateralValue);
        return (_isLiquidable, debtAsset.tokenAddr, maxRepayAmt);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function isActivatedRoller() external view returns (bool) {
        return LoanLib.getLoanStorage().getRollerState();
    }

    /// @notice Internal repay function
    /// @param loanId The id of the loan
    /// @param collateralAmt The amount of the collateral to be repaid
    /// @param debtAmt The amount of the debt to be repaid
    /// @param repayAndDeposit Whether to deposit the collateral after repaying
    /// @return collateralToken The token of the collateral
    /// @return accountId The account id of the loan
    function _repay(
        bytes12 loanId,
        uint128 collateralAmt,
        uint128 debtAmt,
        bool repayAndDeposit
    ) internal returns (address, uint32) {
        LoanStorage.Layout storage lsl = LoanLib.getLoanStorage();
        Loan memory loan = lsl.getLoan(loanId);
        LoanLib.senderIsLoanOwner(msg.sender, AccountLib.getAccountStorage().getAccountAddr(loan.accountId));
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = lsl.getLoanInfo(loan);
        Utils.transferFrom(debtAsset.tokenAddr, msg.sender, debtAmt, msg.value);

        loan = loan.repay(collateralAmt, debtAmt);

        (uint256 healthFactor, , ) = LoanLib.getHealthFactor(
            loan,
            liquidationFactor.ltvThreshold,
            collateralAsset,
            debtAsset
        );
        LoanLib.requireHealthy(healthFactor);

        lsl.loans[loanId] = loan;
        emit Repay(
            loanId,
            msg.sender,
            collateralAsset.tokenAddr,
            debtAsset.tokenAddr,
            collateralAmt,
            debtAmt,
            repayAndDeposit
        );
        return (collateralAsset.tokenAddr, loan.accountId);
    }

    /// @notice Internal liquidate function
    /// @param loanId The loan id to be liquidated
    /// @param repayAmt The amount of the loan to be repaid
    /// @return liquidationAmt The amount of the loan to be liquidated
    /// @return collateralToken The collateral token of the loan
    function _liquidate(bytes12 loanId, uint128 repayAmt) internal returns (LiquidationAmt memory, address) {
        LoanStorage.Layout storage lsl = LoanLib.getLoanStorage();
        Loan memory loan = lsl.getLoan(loanId);
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = lsl.getLoanInfo(loan);

        LiquidationAmt memory liquidationAmt = _liquidationCalculator(
            lsl.getHalfLiquidationThreshold(),
            repayAmt,
            loan,
            collateralAsset,
            debtAsset,
            liquidationFactor
        );

        uint128 totalRemovedCollateralAmt = liquidationAmt.liquidatorRewardAmt + liquidationAmt.protocolPenaltyAmt;
        Utils.transferFrom(debtAsset.tokenAddr, msg.sender, repayAmt, msg.value);

        // loan.debtAmt -= repayAmt;
        // loan.collateralAmt -= totalRemovedCollateralAmt;
        loan.repay(totalRemovedCollateralAmt, repayAmt);

        lsl.loans[loanId] = loan;
        emit Repay(
            loanId,
            msg.sender,
            collateralAsset.tokenAddr,
            debtAsset.tokenAddr,
            totalRemovedCollateralAmt,
            repayAmt,
            false
        );

        return (liquidationAmt, collateralAsset.tokenAddr);
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
    /// @param halfLiquidationThreshold The half liquidation threshold
    /// @param repayAmt The amount of the debt to be repaid
    /// @param loan The loan to be liquidated
    /// @param collateralAsset The collateral asset config
    /// @param debtAsset The debt asset config
    /// @param liquidationFactor The liquidation factor
    /// @return liquidationAmt The liquidation amount struct that contains the
    ///         liquidator reward amount and protocol penalty amount
    function _liquidationCalculator(
        uint16 halfLiquidationThreshold,
        uint128 repayAmt,
        Loan memory loan,
        AssetConfig memory collateralAsset,
        AssetConfig memory debtAsset,
        LiquidationFactor memory liquidationFactor
    ) internal view returns (LiquidationAmt memory) {
        (uint256 healthFactor, uint256 normalizedCollateralPrice, uint256 normalizedDebtPrice) = LoanLib
            .getHealthFactor(loan, liquidationFactor.ltvThreshold, collateralAsset, debtAsset);
        if (!LoanLib.isLiquidable(healthFactor, loan.maturityTime)) revert LoanIsSafe(healthFactor, loan.maturityTime);

        // Calculate the collateral value without decimals
        uint256 collateralValue = _calcCollateralValue(
            normalizedCollateralPrice,
            loan.collateralAmt,
            collateralAsset.decimals
        );
        uint128 maxRepayAmt = _getMaxRepayAmt(halfLiquidationThreshold, loan, collateralValue);
        if (repayAmt > maxRepayAmt) revert RepayAmtExceedsMaxRepayAmt(repayAmt, maxRepayAmt);

        uint256 normalizedRepayValue = (normalizedDebtPrice * repayAmt) / 10 ** debtAsset.decimals;

        // repayToCollateralRatio = LTV_BASE * repayValue / collateralValue
        // LTV_BASE = 1000
        // The repayValue and collateralValue are calculated by formula:
        // value = (normalizedPrice / 10**18) * (amount / 10**decimals)
        // ==> repayToCollateralRatio = (LTV_BASE * normalizedRepayValue / 10**18) / (normalizedCollateralPrice * collateralAmt / 10**18 / 10**collateralDecimals)
        // ==> repayToCollateralRatio = (LTV_BASE * normalizedRepayValue) * 10**collateralDecimals / normalizedCollateralPrice / collateralAmt
        uint256 repayToCollateralRatio = (Config.LTV_BASE * normalizedRepayValue * 10 ** collateralAsset.decimals) /
            normalizedCollateralPrice /
            loan.collateralAmt;

        // case1: if collateral value cannot cover protocol penalty and full liquidator reward
        // in this case, liquidator reward = all collateral, and protocol penalty = 0
        // liquidatorRewardAmt = totalCollateralAmt, and protocolPenaltyAmt = 0
        if (repayToCollateralRatio + liquidationFactor.liquidatorIncentive > Config.MAX_LTV_RATIO)
            return LiquidationAmt(loan.collateralAmt, 0);

        // To compute liquidator reward for case2 and case3: collateral value can cover full liquidator reward
        // The maxLtvRatio is a constant value = 1, and the decimals is 3
        // liquidatorReward = repayValue * (liquidatorIncentiveRatio + maxLtvRatio) / LTV_BASE
        // liquidatorRewardAmt = liquidatorReward equivalent in collateral asset
        // ==> liquidatorRewardAmt = ((liquidatorIncentiveRatio + maxLtvRatio) / LTV_BASE) *
        // (normalizedRepayValue / 1**18) * 10**collateralDecimals / (normalizedCollateralPrice / 1**18)
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
        // ==> protocolPenaltyAmt = (protocolPenaltyRatio / LTV_BASE) * (normalizedRepayValue / 1**18) *
        // 10**collateralDecimals / (normalizedCollateralPrice / 1**18)
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
        return LiquidationAmt(liquidatorRewardAmt, protocolPenaltyAmt);
    }

    /// @notice Get the maximum amount of the debt to be repaid
    /// @dev    If the collateral value is less than half liquidation threshold or the loan is expired,
    ///         then the liquidator can repay the all debt
    ///         otherwise, the liquidator can repay max to half of the debt
    /// @param halfLiquidationThreshold The half liquidation threshold
    /// @param loan The loan to be liquidated
    /// @param collateralValue The collateral value without decimals
    /// @return maxRepayAmt The maximum amount of the debt to be repaid
    function _getMaxRepayAmt(
        uint16 halfLiquidationThreshold,
        Loan memory loan,
        uint256 collateralValue
    ) internal view returns (uint128) {
        uint128 maxRepayAmt = collateralValue < halfLiquidationThreshold || LoanLib.isMatured(loan.maturityTime)
            ? loan.debtAmt
            : loan.debtAmt / 2;
        return maxRepayAmt;
    }

    /// @notice Internal function to supply collateral to AAVE V3 then borrow debt from AAVE V3
    /// @dev    The collateral token is WETH if the collateral token is ETH
    /// @param loanId The loan id to be rolled over
    /// @param collateralTokenAddr The address of the collateral token
    /// @param debtTokenAddr The address of the debt token
    /// @param collateralAmt The amount of the collateral token to be supplied
    /// @param debtAmt The amount of the debt token to be borrowed
    function _supplyToBorrow(
        bytes12 loanId,
        address collateralTokenAddr,
        address debtTokenAddr,
        uint128 collateralAmt,
        uint128 debtAmt
    ) internal {
        AddressStorage.Layout storage asl = AddressLib.getAddressStorage();
        address aaveV3PoolAddr = asl.getAaveV3PoolAddr();
        // AAVE receive WETH as collateral
        address supplyTokenAddr = collateralTokenAddr == Config.ETH_ADDRESS ? asl.getWETHAddr() : collateralTokenAddr;

        ISolidStateERC20(supplyTokenAddr).safeApprove(aaveV3PoolAddr, collateralAmt);
        IPool aaveV3Pool = IPool(aaveV3PoolAddr);
        // referralCode: 0
        // (see https://docs.aave.com/developers/core-contracts/pool#supply)
        try aaveV3Pool.supply(supplyTokenAddr, collateralAmt, msg.sender, Config.AAVE_V3_REFERRAL_CODE) {
            // variable rate mode: 2
            // referralCode: 0
            // (see https://docs.aave.com/developers/core-contracts/pool#borrow)
            try
                aaveV3Pool.borrow(
                    debtTokenAddr,
                    debtAmt,
                    Config.AAVE_V3_INTEREST_RATE_MODE,
                    Config.AAVE_V3_REFERRAL_CODE,
                    msg.sender
                )
            {
                emit Repay(loanId, msg.sender, collateralTokenAddr, debtTokenAddr, collateralAmt, debtAmt, false);
                emit RollToAave(loanId, msg.sender, supplyTokenAddr, debtTokenAddr, collateralAmt, debtAmt);
            } catch Error(string memory err) {
                revert BorrowFromAaveFailedLogString(supplyTokenAddr, collateralAmt, debtTokenAddr, debtAmt, err);
            } catch (bytes memory err) {
                revert BorrowFromAaveFailedLogBytes(supplyTokenAddr, collateralAmt, debtTokenAddr, debtAmt, err);
            }
        } catch Error(string memory err) {
            revert SupplyToAaveFailedLogString(supplyTokenAddr, collateralAmt, err);
        } catch (bytes memory err) {
            revert SupplyToAaveFailedLogBytes(supplyTokenAddr, collateralAmt, err);
        }
    }

    /// @notice Calculate the collateral value
    /// @dev    collateralValue = (normalizedCollateralPrice / 10**18) * (collateralAmt / 10**collateralDecimals)
    /// @param normalizedCollateralPrice The normalized collateral price
    /// @param collateralAmt The collateral amount
    /// @param collateralDecimals The collateral decimals
    /// @return collateralValue The collateral value without decimals
    function _calcCollateralValue(
        uint256 normalizedCollateralPrice,
        uint128 collateralAmt,
        uint16 collateralDecimals
    ) internal pure returns (uint256) {
        return (normalizedCollateralPrice * collateralAmt) / (10 ** collateralDecimals) / 10 ** 18;
    }
}
