// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {AccountStorage} from "../account/AccountStorage.sol";
import {AddressStorage} from "../address/AddressStorage.sol";
import {ProtocolParamsStorage} from "../protocolParams/ProtocolParamsStorage.sol";
import {TokenStorage} from "../token/TokenStorage.sol";
import {IPool} from "../interfaces/aaveV3/IPool.sol";
import {ILoanFacet} from "./ILoanFacet.sol";
import {ProtocolParamsLib} from "../protocolParams/ProtocolParamsLib.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {LoanLib} from "./LoanLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {LoanStorage, LiquidationFactor, Loan, LiquidationAmt, LoanInfo} from "./LoanStorage.sol";
import {Config} from "../libraries/Config.sol";
import {Utils} from "../libraries/Utils.sol";

/**
 * @title Term Structure Loan Facet Contract
 */
contract LoanFacet is ILoanFacet, AccessControlInternal, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using AccountLib for AccountStorage.Layout;
    using AddressLib for AddressStorage.Layout;
    using ProtocolParamsLib for ProtocolParamsStorage.Layout;
    using TokenLib for TokenStorage.Layout;
    using Math for *;
    using LoanLib for *;

    /**
     * @inheritdoc ILoanFacet
     * @dev Anyone can add collateral to the loan
     */
    function addCollateral(bytes12 loanId, uint128 amount) external payable {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        IERC20 collateralToken = loanInfo.collateralAsset.token;
        Utils.transferFrom(collateralToken, msg.sender, amount, msg.value);

        Loan memory loan = loanInfo.loan;
        loan = loan.addCollateral(amount);
        lsl.loans[loanId] = loan;
        emit CollateralAdded(loanId, msg.sender, collateralToken, amount);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function removeCollateral(bytes12 loanId, uint128 amount) external nonReentrant {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        msg.sender.isLoanOwner(loanInfo);

        Loan memory loan = loanInfo.loan;
        loan = loan.removeCollateral(amount);
        loan.requireHealthy(loanInfo);

        lsl.loans[loanId] = loan;
        IERC20 collateralToken = loanInfo.collateralAsset.token;
        Utils.transfer(collateralToken, payable(msg.sender), amount);
        emit CollateralRemoved(loanId, msg.sender, collateralToken, amount);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function repay(bytes12 loanId, uint128 collateralAmt, uint128 debtAmt, bool repayAndDeposit) external payable {
        (IERC20 collateralToken, uint32 accountId) = _repay(loanId, collateralAmt, debtAmt, repayAndDeposit);

        if (repayAndDeposit) {
            TokenStorage.Layout storage tsl = TokenLib.getTokenStorage();
            (uint16 tokenId, AssetConfig memory assetConfig) = tsl.getValidToken(collateralToken);
            TokenLib.validDepositAmt(collateralAmt, assetConfig.minDepositAmt);
            AccountLib.addDepositReq(
                RollupLib.getRollupStorage(),
                msg.sender,
                accountId,
                assetConfig.token,
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
     */
    function liquidate(bytes12 loanId, uint128 repayAmt) external payable returns (uint128, uint128) {
        (LiquidationAmt memory liquidationAmt, IERC20 collateralToken) = _liquidate(loanId, repayAmt);

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
     * @notice Should be `approveDelegation` before `borrow from AAVE V3 pool`
     * @dev Roll the loan to AAVE V3 pool,
     *      the user can transfer the loan of fixed rate and date from term structure
     *      to the floating rate and perpetual position on Aave without repaying the debt
     */
    function rollToAave(bytes12 loanId, uint128 collateralAmt, uint128 debtAmt) external {
        LoanStorage.Layout storage lsl = LoanLib.getLoanStorage();
        bool isActivated = lsl.getRollerState();
        if (!isActivated) revert RollIsNotActivated();

        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        msg.sender.isLoanOwner(loanInfo);

        Loan memory loan = loanInfo.loan;
        loan = loan.repay(collateralAmt, debtAmt);
        loan.requireHealthy(loanInfo);

        lsl.loans[loanId] = loan;

        _supplyToBorrow(loanId, loanInfo.collateralAsset.token, loanInfo.debtAsset.token, collateralAmt, debtAmt);
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
        ) revert InvalidLiquidationFactor(liquidationFactor);

        LoanStorage.Layout storage lsl = LoanLib.getLoanStorage();
        isStableCoinPair
            ? lsl.stableCoinPairLiquidationFactor = liquidationFactor
            : lsl.liquidationFactor = liquidationFactor;
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
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        Loan memory loan = loanInfo.loan;
        (uint256 healthFactor, , ) = loan.getHealthFactor(
            loanInfo.liquidationFactor.ltvThreshold,
            loanInfo.collateralAsset,
            loanInfo.debtAsset
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
    function getLoan(bytes12 loanId) external view returns (Loan memory) {
        return LoanLib.getLoanStorage().getLoan(loanId);
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
        return LoanLib.calcLoanId(accountId, maturityTime, debtTokenId, collateralTokenId);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function resolveLoanId(bytes12 loanId) external pure returns (uint32, uint32, uint16, uint16) {
        return LoanLib.resolveLoanId(loanId);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getLiquidationInfo(bytes12 loanId) external view returns (bool, IERC20, uint128) {
        LoanStorage.Layout storage lsl = LoanLib.getLoanStorage();
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        Loan memory loan = loanInfo.loan;
        (uint256 healthFactor, uint256 normalizedCollateralPrice, ) = loan.getHealthFactor(
            loanInfo.liquidationFactor.ltvThreshold,
            loanInfo.collateralAsset,
            loanInfo.debtAsset
        );
        bool _isLiquidable = LoanLib.isLiquidable(healthFactor, loanInfo.maturityTime);

        uint256 collateralValue = normalizedCollateralPrice.calcCollateralValue(
            loan.collateralAmt,
            loanInfo.collateralAsset.decimals
        );
        uint16 halfLiquidationThreshold = lsl.getHalfLiquidationThreshold();
        uint128 maxRepayAmt = collateralValue.calcMaxRepayAmt(
            loan.debtAmt,
            loanInfo.maturityTime,
            halfLiquidationThreshold
        );
        return (_isLiquidable, loanInfo.debtAsset.token, maxRepayAmt);
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
    ) internal returns (IERC20, uint32) {
        LoanStorage.Layout storage lsl = LoanLib.getLoanStorage();
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        msg.sender.isLoanOwner(loanInfo);

        Loan memory loan = loanInfo.loan;
        IERC20 collateralToken = loanInfo.collateralAsset.token;
        IERC20 debtToken = loanInfo.debtAsset.token;
        Utils.transferFrom(debtToken, msg.sender, debtAmt, msg.value);

        loan = loan.repay(collateralAmt, debtAmt);
        loan.requireHealthy(loanInfo);

        lsl.loans[loanId] = loan;
        emit Repayment(loanId, msg.sender, collateralToken, debtToken, collateralAmt, debtAmt, repayAndDeposit);
        return (collateralToken, loanInfo.accountId);
    }

    /// @notice Internal liquidate function
    /// @param loanId The loan id to be liquidated
    /// @param repayAmt The amount of the loan to be repaid
    /// @return liquidationAmt The amount of the loan to be liquidated
    /// @return collateralToken The collateral token of the loan
    function _liquidate(bytes12 loanId, uint128 repayAmt) internal returns (LiquidationAmt memory, IERC20) {
        LoanStorage.Layout storage lsl = LoanLib.getLoanStorage();
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        Loan memory loan = loanInfo.loan;

        LiquidationAmt memory liquidationAmt = _liquidationCalculator(
            repayAmt,
            loanInfo,
            lsl.getHalfLiquidationThreshold()
        );

        uint128 totalRemovedCollateralAmt = liquidationAmt.liquidatorRewardAmt + liquidationAmt.protocolPenaltyAmt;
        IERC20 collateralToken = loanInfo.collateralAsset.token;
        IERC20 debtToken = loanInfo.debtAsset.token;
        Utils.transferFrom(debtToken, msg.sender, repayAmt, msg.value);

        loan.repay(totalRemovedCollateralAmt, repayAmt);
        lsl.loans[loanId] = loan;

        emit Repayment(loanId, msg.sender, collateralToken, debtToken, totalRemovedCollateralAmt, repayAmt, false);

        return (liquidationAmt, collateralToken);
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
    /// @param repayAmt The amount of the debt to be repaid
    /// @param loanInfo The loan info
    /// @param halfLiquidationThreshold The half liquidation threshold
    /// @return liquidationAmt The liquidation amount struct that contains the
    ///         liquidator reward amount and protocol penalty amount
    function _liquidationCalculator(
        uint128 repayAmt,
        LoanInfo memory loanInfo,
        uint16 halfLiquidationThreshold
    ) internal view returns (LiquidationAmt memory) {
        LiquidationFactor memory liquidationFactor = loanInfo.liquidationFactor;
        Loan memory loan = loanInfo.loan;
        uint128 collateralAmt = loan.collateralAmt;
        uint256 repayValueEquivCollateralAmt;

        // {} scope to avoid stack too deep error
        {
            AssetConfig memory collateralAsset = loanInfo.collateralAsset;
            AssetConfig memory debtAsset = loanInfo.debtAsset;
            (uint256 healthFactor, uint256 normalizedCollateralPrice, uint256 normalizedDebtPrice) = loan
                .getHealthFactor(liquidationFactor.ltvThreshold, collateralAsset, debtAsset);
            if (!LoanLib.isLiquidable(healthFactor, loanInfo.maturityTime))
                revert LoanIsSafe(healthFactor, loanInfo.maturityTime);

            uint128 maxRepayAmt = normalizedCollateralPrice
                .calcCollateralValue(collateralAmt, collateralAsset.decimals)
                .calcMaxRepayAmt(loan.debtAmt, loanInfo.maturityTime, halfLiquidationThreshold);
            if (repayAmt > maxRepayAmt) revert RepayAmtExceedsMaxRepayAmt(repayAmt, maxRepayAmt);

            // repayValueEquivCollateralAmt = repayValue / collateralPrice * 10**collateralDecimals
            // ==> repayValueEquivCollateralAmt = (normalizedDebtPrice / 10**18) * (repayAmt / 10**debtAssetDecimals) /
            //     (normalizedCollateralPrice / 10**18) * 10**collateralAssetDecimals
            // ==> repayValueEquivCollateralAmt = (normalizedDebtPrice * repayAmt / 10**debtAssetDecimals) /
            //     normalizedCollateralPrice * 10**collateralAssetDecimals
            // ==> repayValueEquivCollateralAmt = normalizedRepayValue * 10**collateralAssetDecimals / normalizedCollateralPrice
            uint256 normalizedRepayValue = normalizedDebtPrice.mulDiv(repayAmt, 10 ** debtAsset.decimals);
            repayValueEquivCollateralAmt = normalizedRepayValue.mulDiv(
                10 ** collateralAsset.decimals,
                normalizedCollateralPrice
            );
        }

        // LTV_BASE = 1000
        // value = (normalizedPrice / 10**18) * (amount / 10**decimals)
        // The repayToCollateralRatio is calculated by formula:
        // repayToCollateralRatio = LTV_BASE * repayValue / collateralValue
        // ==> repayToCollateralRatio = LTV_BASE * ((normalizedDebtPrice / 10**18) * (repayAmt / 10**debtAssetDecimals)) /
        //     ((normalizedCollateralPrice / 10**18) * (collateralAmt / 10**collateralAssetDecimals))
        // ==> repayToCollateralRatio = LTV_BASE * (normalizedDebtPrice * repayAmt / 10**debtAssetDecimals) /
        //     (normalizedCollateralPrice * collateralAmt / 10**collateralAssetDecimals)
        // ==> repayToCollateralRatio = LTV_BASE * (normalizedDebtPrice * repayAmt / 10**debtAssetDecimals) * 10**collateralAssetDecimals /
        //     normalizedCollateralPrice / collateralAmt
        // ==> repayToCollateralRatio = LTV_BASE * normalizedRepayValue * 10**collateralAssetDecimals /
        //     normalizedCollateralPrice / collateralAmt
        // ==> repayToCollateralRatio = LTV_BASE * repayValueEquivCollateralAmt / collateralAmt
        uint256 repayToCollateralRatio = Config.LTV_BASE.mulDiv(repayValueEquivCollateralAmt, collateralAmt);
        uint16 liquidatorIncentive = liquidationFactor.liquidatorIncentive;
        uint16 protocolPenalty = liquidationFactor.protocolPenalty;

        // case1: if collateral value cannot cover protocol penalty and full liquidator reward
        // in this case, liquidator reward = all collateral, and protocol penalty = 0
        // liquidatorRewardAmt = totalCollateralAmt, and protocolPenaltyAmt = 0
        if (repayToCollateralRatio + liquidatorIncentive > Config.MAX_LTV_RATIO)
            return LiquidationAmt({liquidatorRewardAmt: collateralAmt, protocolPenaltyAmt: 0});

        // To compute liquidator reward for case2 and case3: collateral value can cover full liquidator reward
        // The maxLtvRatio is a constant value = 1, and the decimals is 3
        // liquidatorReward = repayValueEquivCollateralAmt + repayValueEquivCollateralAmt * liquidatorIncentive / LTV_BASE
        // liquidatorReward = repayValueEquivCollateralAmt * (MAX_LTV_RATIO + liquidatorIncentive) / LTV_BASE
        uint128 liquidatorRewardAmt = SafeCast.toUint128(
            (repayValueEquivCollateralAmt).mulDiv(Config.MAX_LTV_RATIO + liquidatorIncentive, Config.LTV_BASE)
        );

        // To compute protocol penalty for case2: collateral value can not cover full protocol penalty
        // protocolPenaltyAmt = totalCollateralAmt - liquidatorRewardAmt
        //
        // To compute protocol penalty for case3: collateral value can cover full protocol penalty
        // protocolPenalty = repayValueEquivCollateralAmt * protocolPenalty / LTV_BASE
        uint128 protocolPenaltyAmt;
        (repayToCollateralRatio + liquidatorIncentive + protocolPenalty) > Config.MAX_LTV_RATIO
            ? protocolPenaltyAmt = collateralAmt - liquidatorRewardAmt
            : protocolPenaltyAmt = SafeCast.toUint128(
            repayValueEquivCollateralAmt.mulDiv(protocolPenalty, Config.LTV_BASE)
        );
        return LiquidationAmt({liquidatorRewardAmt: liquidatorRewardAmt, protocolPenaltyAmt: protocolPenaltyAmt});
    }

    /// @notice Internal function to supply collateral to AAVE V3 then borrow debt from AAVE V3
    /// @dev    The collateral token is WETH if the collateral token is ETH
    /// @param loanId The loan id to be rolled over
    /// @param collateralToken The collateral token to be supplied
    /// @param debtToken The debt token to be borrowed
    /// @param collateralAmt The amount of the collateral token to be supplied
    /// @param debtAmt The amount of the debt token to be borrowed
    function _supplyToBorrow(
        bytes12 loanId,
        IERC20 collateralToken,
        IERC20 debtToken,
        uint128 collateralAmt,
        uint128 debtAmt
    ) internal {
        AddressStorage.Layout storage asl = AddressLib.getAddressStorage();
        // AAVE receive WETH as collateral
        IERC20 supplyToken = address(collateralToken) == Config.ETH_ADDRESS ? asl.getWETH() : collateralToken;

        IPool aaveV3Pool = asl.getAaveV3Pool();
        supplyToken.safeApprove(address(aaveV3Pool), collateralAmt);
        // referralCode: 0
        // (see https://docs.aave.com/developers/core-contracts/pool#supply)
        try aaveV3Pool.supply(address(supplyToken), collateralAmt, msg.sender, Config.AAVE_V3_REFERRAL_CODE) {
            // variable rate mode: 2
            // referralCode: 0
            // (see https://docs.aave.com/developers/core-contracts/pool#borrow)
            try
                aaveV3Pool.borrow(
                    address(debtToken),
                    debtAmt,
                    Config.AAVE_V3_INTEREST_RATE_MODE,
                    Config.AAVE_V3_REFERRAL_CODE,
                    msg.sender
                )
            {
                emit Repayment(loanId, msg.sender, collateralToken, debtToken, collateralAmt, debtAmt, false);
                emit RollToAave(loanId, msg.sender, supplyToken, debtToken, collateralAmt, debtAmt);
            } catch Error(string memory err) {
                revert BorrowFromAaveFailedLogString(supplyToken, collateralAmt, debtToken, debtAmt, err);
            } catch (bytes memory err) {
                revert BorrowFromAaveFailedLogBytes(supplyToken, collateralAmt, debtToken, debtAmt, err);
            }
        } catch Error(string memory err) {
            revert SupplyToAaveFailedLogString(supplyToken, collateralAmt, err);
        } catch (bytes memory err) {
            revert SupplyToAaveFailedLogBytes(supplyToken, collateralAmt, err);
        }
    }
}
