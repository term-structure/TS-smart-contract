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
import {RollupStorage} from "../rollup/RollupStorage.sol";
import {TokenStorage} from "../token/TokenStorage.sol";
import {IPool} from "../interfaces/aaveV3/IPool.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {ILoanFacet} from "./ILoanFacet.sol";
import {ProtocolParamsLib} from "../protocolParams/ProtocolParamsLib.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {LoanLib} from "./LoanLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {Operations} from "../libraries/Operations.sol";
import {Config} from "../libraries/Config.sol";
import {Utils} from "../libraries/Utils.sol";
import {LoanStorage, LiquidationFactor, Loan, LiquidationAmt, LoanInfo, RollBorrowOrder} from "./LoanStorage.sol";
import {DELEGATE_REMOVE_COLLATERAL_MASK, DELEGATE_REPAY_MASK, DELEGATE_ROLL_TO_AAVE_MASK, DELEGATE_ROLL_BORROW_MASK, DELEGATE_FORCE_CANCEL_ROLL_BORROW_MASK} from "../libraries/Delegate.sol";
import {REMOVE_COLLATERAL_TYPEHASH, REPAY_TYPEHASH, ROLL_BORROW_TYPEHASH, FORCE_CANCEL_ROLL_BORROW_TYPEHASH, ROLL_TO_AAVE_TYPEHASH} from "../libraries/TypeHash.sol";

/**
 * @title Term Structure Loan Facet Contract
 * @author Term Structure Labs
 * @notice The LoanFacet is a contract to manages loans in Term Structure Protocol
 */
contract LoanFacet is ILoanFacet, AccessControlInternal, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using AccountLib for AccountStorage.Layout;
    using AddressLib for AddressStorage.Layout;
    using ProtocolParamsLib for ProtocolParamsStorage.Layout;
    using TokenLib for TokenStorage.Layout;
    using SafeCast for uint256;
    using Math for *;
    using LoanLib for *;
    using Utils for *;

    /* ============ External Functions ============ */

    /**
     * @inheritdoc ILoanFacet
     * @dev Anyone can add collateral to the loan
     */
    function addCollateral(bytes12 loanId, uint128 amount) external payable {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        address loanOwner = AccountStorage.layout().getAccountAddr(loanInfo.accountId);

        IERC20 collateralToken = loanInfo.collateralAsset.token;
        Utils.transferFrom(collateralToken, msg.sender, amount, msg.value);

        Loan memory loan = loanInfo.loan;
        loan.addCollateral(amount);
        lsl.loans[loanId] = loan;
        emit CollateralAdded(loanId, msg.sender, loanOwner, collateralToken, amount);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function removeCollateral(bytes12 loanId, uint128 amount) external nonReentrant {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        AccountStorage.Layout storage asl = AccountStorage.layout();
        address loanOwner = asl.getAccountAddr(loanInfo.accountId);
        asl.requireValidCaller(msg.sender, loanOwner, DELEGATE_REMOVE_COLLATERAL_MASK);

        _removeCollateral(lsl, loanInfo, loanId, msg.sender, loanOwner, amount);
    }

    //! mainnet-audit
    /**
     * @inheritdoc ILoanFacet
     */
    function removeCollateralWithPermit(
        bytes12 loanId,
        uint128 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        address loanOwner;

        // {} scope to avoid stack too deep error
        {
            AccountStorage.Layout storage asl = AccountStorage.layout();
            loanOwner = asl.getAccountAddr(loanInfo.accountId);
            bytes32 structHash = _calcRemoveCollateralStructHash(
                loanId,
                amount,
                asl.getPermitNonce(loanOwner),
                deadline
            );
            asl.validatePermitAndIncreaseNonce(loanOwner, structHash, deadline, v, r, s);
        }

        _removeCollateral(lsl, loanInfo, loanId, msg.sender, loanOwner, amount);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function repay(bytes12 loanId, uint128 collateralAmt, uint128 debtAmt, bool repayAndDeposit) external payable {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        AccountStorage.Layout storage asl = AccountStorage.layout();
        address loanOwner = asl.getAccountAddr(loanInfo.accountId);
        asl.requireValidCaller(msg.sender, loanOwner, DELEGATE_REPAY_MASK);

        _repay(lsl, loanInfo, msg.sender, loanOwner, loanId, collateralAmt, debtAmt, repayAndDeposit, msg.value);
    }

    //! mainnet-audit
    /**
     * @inheritdoc ILoanFacet
     */
    function repayWithPermit(
        bytes12 loanId,
        uint128 collateralAmt,
        uint128 debtAmt,
        bool repayAndDeposit,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        address loanOwner;

        // {} scope to avoid stack too deep error
        {
            AccountStorage.Layout storage asl = AccountStorage.layout();
            loanOwner = asl.getAccountAddr(loanInfo.accountId);
            bytes32 structHash = _calcRepayStructHash(
                loanId,
                collateralAmt,
                debtAmt,
                repayAndDeposit,
                asl.getPermitNonce(loanOwner),
                deadline
            );
            asl.validatePermitAndIncreaseNonce(loanOwner, structHash, deadline, v, r, s);
        }

        _repay(lsl, loanInfo, msg.sender, loanOwner, loanId, collateralAmt, debtAmt, repayAndDeposit, msg.value);
    }

    /**
     * @inheritdoc ILoanFacet
     * @notice Should be `approveDelegation` before `borrow from AAVE V3 pool`
     * @dev Roll the loan to AAVE V3 pool,
     *      the user can transfer the loan of fixed rate and date from term structure
     *      to the floating rate and perpetual position on Aave without repaying the debt
     */
    function rollToAave(bytes12 loanId, uint128 collateralAmt, uint128 debtAmt) external {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        if (!lsl.getRollerState()) revert RollIsNotActivated();

        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        AccountStorage.Layout storage asl = AccountStorage.layout();
        address loanOwner = asl.getAccountAddr(loanInfo.accountId);
        asl.requireValidCaller(msg.sender, loanOwner, DELEGATE_ROLL_TO_AAVE_MASK);

        _rollToAave(lsl, loanInfo, msg.sender, loanOwner, loanId, collateralAmt, debtAmt);
    }

    //! mainnet-audit
    /**
     * @inheritdoc ILoanFacet
     * @notice Should be `approveDelegation` before `borrow from AAVE V3 pool`
     * @dev Roll the loan to AAVE V3 pool with permit signature
     *      the user can transfer the loan of fixed rate and date from term structure
     *      to the floating rate and perpetual position on Aave without repaying the debt
     */
    function rollToAaveWithPermit(
        bytes12 loanId,
        uint128 collateralAmt,
        uint128 debtAmt,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        if (!lsl.getRollerState()) revert RollIsNotActivated();

        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        address loanOwner;

        // {} scope to avoid stack too deep error
        {
            AccountStorage.Layout storage asl = AccountStorage.layout();
            loanOwner = asl.getAccountAddr(loanInfo.accountId);
            bytes32 structHash = _calcRollToAaveStructHash(
                loanId,
                collateralAmt,
                debtAmt,
                asl.getPermitNonce(loanOwner),
                deadline
            );
            asl.validatePermitAndIncreaseNonce(loanOwner, structHash, deadline, v, r, s);
        }

        _rollToAave(lsl, loanInfo, msg.sender, loanOwner, loanId, collateralAmt, debtAmt);
    }

    /**
     * @inheritdoc ILoanFacet
     * @dev Cannot roll total collateral amount because the original loan will be not strict healthy if success
     */
    function rollBorrow(RollBorrowOrder memory rollBorrowOrder) external payable {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        if (!lsl.getRollerState()) revert RollIsNotActivated();
        if (msg.value != lsl.getRollOverFee()) revert InvalidRollBorrowFee(msg.value);

        Utils.transferNativeToken(ProtocolParamsStorage.layout().getVaultAddr(), msg.value);

        LoanInfo memory loanInfo = lsl.getLoanInfo(rollBorrowOrder.loanId);
        AccountStorage.Layout storage asl = AccountStorage.layout();
        address loanOwner = asl.getAccountAddr(loanInfo.accountId);
        asl.requireValidCaller(msg.sender, loanOwner, DELEGATE_ROLL_BORROW_MASK);

        uint32 newMaturityTime = _requireValidOrder(rollBorrowOrder, loanInfo, rollBorrowOrder.loanId);

        _rollBorrow(lsl, rollBorrowOrder, loanInfo, msg.sender, loanOwner, rollBorrowOrder.loanId, newMaturityTime);
    }

    //! mainnet-audit
    /**
     * @inheritdoc ILoanFacet
     * @dev Cannot roll total collateral amount because the original loan will be not strict healthy if success
     */
    function rollBorrowWithPermit(
        RollBorrowOrder memory rollBorrowOrder,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        if (!lsl.getRollerState()) revert RollIsNotActivated();
        if (msg.value != lsl.getRollOverFee()) revert InvalidRollBorrowFee(msg.value);

        Utils.transferNativeToken(ProtocolParamsStorage.layout().getVaultAddr(), msg.value);

        LoanInfo memory loanInfo = lsl.getLoanInfo(rollBorrowOrder.loanId);
        address loanOwner;

        // {} scope to avoid stack too deep error
        {
            AccountStorage.Layout storage asl = AccountStorage.layout();
            loanOwner = asl.getAccountAddr(loanInfo.accountId);
            bytes32 structHash = _calcRollBorrowStructHash(rollBorrowOrder, asl.getPermitNonce(loanOwner), deadline);
            asl.validatePermitAndIncreaseNonce(loanOwner, structHash, deadline, v, r, s);
        }

        uint32 newMaturityTime = _requireValidOrder(rollBorrowOrder, loanInfo, rollBorrowOrder.loanId);

        _rollBorrow(lsl, rollBorrowOrder, loanInfo, msg.sender, loanOwner, rollBorrowOrder.loanId, newMaturityTime);
    }

    /**
     * @inheritdoc ILoanFacet
     * @dev The force cancel roll borrow action will add this request in L1 request queue,
     *      to force this transaction must to be packaged in rollup block
     *      to avoid the `UserCancelRollBorrow` operation be maliciously ignored in L2
     */
    function forceCancelRollBorrow(bytes12 loanId) external {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        if (!lsl.getRollerState()) revert RollIsNotActivated();

        (uint32 accountId, uint32 maturityTime, uint16 debtTokenId, uint16 collateralTokenId) = LoanLib.resolveLoanId(
            loanId
        );
        AccountStorage.Layout storage asl = AccountStorage.layout();
        address loanOwner = asl.getAccountAddr(accountId);
        asl.requireValidCaller(msg.sender, loanOwner, DELEGATE_FORCE_CANCEL_ROLL_BORROW_MASK);

        _forceCancelRollBorrow(
            lsl,
            msg.sender,
            loanOwner,
            loanId,
            accountId,
            debtTokenId,
            collateralTokenId,
            maturityTime
        );
    }

    //! mainnet-audit
    /**
     * @inheritdoc ILoanFacet
     * @dev The force cancel roll borrow action will add this request in L1 request queue,
     *      to force this transaction must to be packaged in rollup block
     *      to avoid the `UserCancelRollBorrow` operation be maliciously ignored in L2
     */
    function forceCancelRollBorrowWithPermit(bytes12 loanId, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        if (!lsl.getRollerState()) revert RollIsNotActivated();

        (uint32 accountId, uint32 maturityTime, uint16 debtTokenId, uint16 collateralTokenId) = LoanLib.resolveLoanId(
            loanId
        );
        address loanOwner;

        // {} scope to avoid stack too deep error
        {
            AccountStorage.Layout storage asl = AccountStorage.layout();
            loanOwner = asl.getAccountAddr(accountId);
            bytes32 structHash = _calcForceCancelRollBorrowStructHash(loanId, asl.getPermitNonce(loanOwner), deadline);
            asl.validatePermitAndIncreaseNonce(loanOwner, structHash, deadline, v, r, s);
        }

        _forceCancelRollBorrow(
            lsl,
            msg.sender,
            loanOwner,
            loanId,
            accountId,
            debtTokenId,
            collateralTokenId,
            maturityTime
        );
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function liquidate(bytes12 loanId, uint128 repayAmt) external payable returns (uint128, uint128) {
        (LiquidationAmt memory liquidationAmt, IERC20 collateralToken) = _liquidate(msg.sender, loanId, repayAmt);

        uint128 liquidatorRewardAmt = liquidationAmt.liquidatorRewardAmt;
        uint128 protocolPenaltyAmt = liquidationAmt.protocolPenaltyAmt;
        Utils.transfer(collateralToken, payable(msg.sender), liquidatorRewardAmt);

        address payable treasuryAddr = ProtocolParamsStorage.layout().getTreasuryAddr();
        Utils.transfer(collateralToken, treasuryAddr, protocolPenaltyAmt);

        emit Liquidation(loanId, msg.sender, collateralToken, liquidatorRewardAmt, protocolPenaltyAmt);
        return (liquidatorRewardAmt, protocolPenaltyAmt);
    }

    /* ============ Admin Functions ============ */

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
        uint16 borrowOrderLtvThreshold = liquidationFactor.borrowOrderLtvThreshold;
        uint16 liquidationLtvThreshold = liquidationFactor.liquidationLtvThreshold;
        if (borrowOrderLtvThreshold == 0) revert InvalidLiquidationFactor(liquidationFactor);
        if (liquidationLtvThreshold == 0) revert InvalidLiquidationFactor(liquidationFactor);
        if (borrowOrderLtvThreshold > liquidationLtvThreshold) revert InvalidLiquidationFactor(liquidationFactor);
        if (
            liquidationLtvThreshold + liquidationFactor.liquidatorIncentive + liquidationFactor.protocolPenalty >
            Config.MAX_LTV_RATIO
        ) revert InvalidLiquidationFactor(liquidationFactor);

        LoanStorage.Layout storage lsl = LoanStorage.layout();
        isStableCoinPair
            ? lsl.stableCoinPairLiquidationFactor = liquidationFactor
            : lsl.liquidationFactor = liquidationFactor;
        emit SetLiquidationFactor(liquidationFactor, isStableCoinPair);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function setActivatedRoller(bool isActivated) external onlyRole(Config.ADMIN_ROLE) {
        LoanStorage.layout().isActivatedRoller = isActivated;
        emit SetActivatedRoller(isActivated);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function setBorrowFeeRate(uint32 borrowFeeRate) external onlyRole(Config.ADMIN_ROLE) {
        LoanStorage.layout().borrowFeeRate = borrowFeeRate;
        emit SetBorrowFeeRate(borrowFeeRate);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function setRollOverFee(uint256 rollOverFee) external onlyRole(Config.ADMIN_ROLE) {
        LoanStorage.layout().rollOverFee = rollOverFee;
        emit SetRollOverFee(rollOverFee);
    }

    /* ============ External View Functions ============ */

    /**
     * @inheritdoc ILoanFacet
     */
    function getHealthFactor(bytes12 loanId) external view returns (uint256) {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        Loan memory loan = loanInfo.loan;
        (uint256 healthFactor, , ) = loan.getHealthFactor(
            loanInfo.liquidationFactor.liquidationLtvThreshold,
            loanInfo.collateralAsset,
            loanInfo.debtAsset
        );
        return healthFactor;
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getHalfLiquidationThreshold() external view returns (uint16) {
        return LoanStorage.layout().getHalfLiquidationThreshold();
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getLiquidationFactor(bool isStableCoinPair) external view returns (LiquidationFactor memory) {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        return isStableCoinPair ? lsl.getStableCoinPairLiquidationFactor() : lsl.getLiquidationFactor();
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getLoan(bytes12 loanId) external view returns (Loan memory) {
        return LoanStorage.layout().getLoan(loanId);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getLiquidationInfo(bytes12 loanId) external view returns (bool, IERC20, uint128) {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        Loan memory loan = loanInfo.loan;
        (uint256 healthFactor, uint256 normalizedCollateralPrice, ) = loan.getHealthFactor(
            loanInfo.liquidationFactor.liquidationLtvThreshold,
            loanInfo.collateralAsset,
            loanInfo.debtAsset
        );
        bool _isLiquidable = LoanLib.isLiquidable(healthFactor, loanInfo.maturityTime);

        uint16 halfLiquidationThreshold = lsl.getHalfLiquidationThreshold();
        uint128 maxRepayAmt = normalizedCollateralPrice
            .calcCollateralValue(loan.collateralAmt, loanInfo.collateralAsset.decimals)
            .calcMaxRepayAmt(loan.debtAmt, loanInfo.maturityTime, halfLiquidationThreshold);

        return (_isLiquidable, loanInfo.debtAsset.token, maxRepayAmt);
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getBorrowFeeRate() external view returns (uint32) {
        return LoanStorage.layout().getBorrowFeeRate();
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function getRollOverFee() external view returns (uint256) {
        return LoanStorage.layout().getRollOverFee();
    }

    /**
     * @inheritdoc ILoanFacet
     */
    function isActivatedRoller() external view returns (bool) {
        return LoanStorage.layout().getRollerState();
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

    /* ============ Internal Functions ============ */

    /// @notice Internal remove collateral function
    /// @param lsl The loan storage layout
    /// @param loanInfo The loan info
    /// @param loanId The id of the loan
    /// @param caller The caller to remove the collateral
    /// @param loanOwner The owner of the loan
    /// @param amount The amount of the collateral to be removed
    function _removeCollateral(
        LoanStorage.Layout storage lsl,
        LoanInfo memory loanInfo,
        bytes12 loanId,
        address caller,
        address loanOwner,
        uint128 amount
    ) internal {
        Loan memory loan = loanInfo.loan;
        loan.removeCollateral(amount);
        loan.requireHealthy(loanInfo.liquidationFactor, loanInfo.collateralAsset, loanInfo.debtAsset);

        lsl.loans[loanId] = loan;
        IERC20 collateralToken = loanInfo.collateralAsset.token;
        Utils.transfer(collateralToken, payable(loanOwner), amount);
        emit CollateralRemoved(loanId, caller, loanOwner, collateralToken, amount);
    }

    /// @notice Internal repay function
    /// @param lsl The loan storage layout
    /// @param loanInfo The loan info
    /// @param caller The caller to repay the loan
    /// @param loanOwner The owner of the loan
    /// @param loanId The id of the loan
    /// @param collateralAmt The amount of the collateral to be repaid
    /// @param debtAmt The amount of the debt to be repaid
    /// @param repayAndDeposit The flag to indicate whether to repay and deposit
    /// @param msgValue The value of the message
    function _repay(
        LoanStorage.Layout storage lsl,
        LoanInfo memory loanInfo,
        address caller,
        address loanOwner,
        bytes12 loanId,
        uint128 collateralAmt,
        uint128 debtAmt,
        bool repayAndDeposit,
        uint256 msgValue
    ) internal {
        Loan memory loan = loanInfo.loan;
        Utils.transferFrom(loanInfo.debtAsset.token, caller, debtAmt, msgValue);

        loan.repay(collateralAmt, debtAmt);
        loan.requireHealthy(loanInfo.liquidationFactor, loanInfo.collateralAsset, loanInfo.debtAsset);

        lsl.loans[loanId] = loan;
        emit Repayment(
            loanId,
            caller,
            loanOwner,
            loanInfo.collateralAsset.token,
            loanInfo.debtAsset.token,
            collateralAmt,
            debtAmt,
            repayAndDeposit
        );

        if (repayAndDeposit) {
            TokenStorage.Layout storage tsl = TokenStorage.layout();
            (uint16 tokenId, AssetConfig memory assetConfig) = tsl.getValidToken(loanInfo.collateralAsset.token);
            TokenLib.validDepositAmt(collateralAmt, assetConfig.minDepositAmt);
            AccountLib.addDepositReq(
                RollupStorage.layout(),
                caller,
                loanOwner,
                loanInfo.accountId,
                assetConfig.token,
                tokenId,
                assetConfig.decimals,
                collateralAmt
            );
        } else {
            Utils.transfer(loanInfo.collateralAsset.token, payable(loanOwner), collateralAmt);
        }
    }

    /// @notice Internal function to roll to AAVE V3
    /// @param lsl The loan storage layout
    /// @param loanInfo The loan info
    /// @param caller The caller to roll to AAVE
    /// @param loanOwner The loan owner
    /// @param loanId The loan id to be rolled over
    /// @param collateralAmt The amount of the collateral to be supplied to AAVE
    /// @param debtAmt The amount of the debt to be borrowed from AAVE
    function _rollToAave(
        LoanStorage.Layout storage lsl,
        LoanInfo memory loanInfo,
        address caller,
        address loanOwner,
        bytes12 loanId,
        uint128 collateralAmt,
        uint128 debtAmt
    ) internal {
        Loan memory loan = loanInfo.loan;
        AssetConfig memory collateralAsset = loanInfo.collateralAsset;
        AssetConfig memory debtAsset = loanInfo.debtAsset;
        loan.repay(collateralAmt, debtAmt);
        loan.requireHealthy(loanInfo.liquidationFactor, collateralAsset, debtAsset);

        lsl.loans[loanId] = loan;

        _supplyToBorrow(caller, loanOwner, loanId, collateralAsset.token, debtAsset.token, collateralAmt, debtAmt);
    }

    /// @notice Internal function to supply collateral to AAVE V3 then borrow debt from AAVE V3
    /// @dev    The collateral token is WETH if the collateral token is ETH
    /// @param caller The caller to roll to AAVE
    /// @param loanOwner The loan owner
    /// @param loanId The loan id to be rolled over
    /// @param collateralToken The collateral token to be supplied
    /// @param debtToken The debt token to be borrowed
    /// @param collateralAmt The amount of the collateral token to be supplied
    /// @param debtAmt The amount of the debt token to be borrowed
    function _supplyToBorrow(
        address caller,
        address loanOwner,
        bytes12 loanId,
        IERC20 collateralToken,
        IERC20 debtToken,
        uint128 collateralAmt,
        uint128 debtAmt
    ) internal {
        AddressStorage.Layout storage asl = AddressStorage.layout();
        // AAVE receive WETH as collateral
        IERC20 supplyToken = address(collateralToken) == Config.ETH_ADDRESS ? asl.getWETH() : collateralToken;

        IPool aaveV3Pool = asl.getAaveV3Pool();
        supplyToken.safeApprove(address(aaveV3Pool), collateralAmt);
        // referralCode: 0
        // (see https://docs.aave.com/developers/core-contracts/pool#supply)
        try aaveV3Pool.supply(address(supplyToken), collateralAmt, loanOwner, Config.AAVE_V3_REFERRAL_CODE) {
            // variable rate mode: 2
            // referralCode: 0
            // (see https://docs.aave.com/developers/core-contracts/pool#borrow)
            try
                aaveV3Pool.borrow(
                    address(debtToken),
                    debtAmt,
                    Config.AAVE_V3_INTEREST_RATE_MODE,
                    Config.AAVE_V3_REFERRAL_CODE,
                    loanOwner
                )
            {
                emit Repayment(loanId, caller, loanOwner, collateralToken, debtToken, collateralAmt, debtAmt, false);
                emit RollToAave(loanId, caller, loanOwner, supplyToken, debtToken, collateralAmt, debtAmt);
            } catch (bytes memory err) {
                revert BorrowFromAaveFailed(supplyToken, collateralAmt, debtToken, debtAmt, err);
            }
        } catch (bytes memory err) {
            revert SupplyToAaveFailed(supplyToken, collateralAmt, err);
        }
    }

    /// @notice Internal liquidate function
    /// @param caller The caller to liquidate the loan
    /// @param loanId The loan id to be liquidated
    /// @param repayAmt The amount of the loan to be repaid
    /// @return liquidationAmt The amount of the loan to be liquidated
    /// @return collateralToken The collateral token of the loan
    function _liquidate(
        address caller,
        bytes12 loanId,
        uint128 repayAmt
    ) internal returns (LiquidationAmt memory, IERC20) {
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        LoanInfo memory loanInfo = lsl.getLoanInfo(loanId);
        Loan memory loan = loanInfo.loan;
        address loanOwner = AccountStorage.layout().getAccountAddr(loanInfo.accountId);

        LiquidationAmt memory liquidationAmt = _liquidationCalculator(
            repayAmt,
            loanInfo,
            lsl.getHalfLiquidationThreshold()
        );

        uint128 totalRemovedCollateralAmt = liquidationAmt.liquidatorRewardAmt + liquidationAmt.protocolPenaltyAmt;
        Utils.transferFrom(loanInfo.debtAsset.token, caller, repayAmt, msg.value);

        /// remove all locked collateral (equivalent to cancelling any roll borrow order)
        if (loan.lockedCollateralAmt > 0) loan.removeLockedCollateral(loan.lockedCollateralAmt);

        loan.repay(totalRemovedCollateralAmt, repayAmt);
        lsl.loans[loanId] = loan;

        emit Repayment(
            loanId,
            caller,
            loanOwner,
            loanInfo.collateralAsset.token,
            loanInfo.debtAsset.token,
            totalRemovedCollateralAmt,
            repayAmt,
            false
        );

        return (liquidationAmt, loanInfo.collateralAsset.token);
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
                .getHealthFactor(liquidationFactor.liquidationLtvThreshold, collateralAsset, debtAsset);
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

    /// @notice Internal function check the roll borrow order is valid
    /// @param rollBorrowOrder The roll borrow order
    /// @param loanInfo The loan info
    /// @param loanId The id of the loan
    function _requireValidOrder(
        RollBorrowOrder memory rollBorrowOrder,
        LoanInfo memory loanInfo,
        bytes12 loanId
    ) internal view returns (uint32) {
        // check the tsb token of next maturity time is exist
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        (, AssetConfig memory assetConfig) = tsl.getAssetConfig(IERC20(rollBorrowOrder.tsbToken));
        if (!assetConfig.isTsbToken) revert InvalidTsbToken(rollBorrowOrder.tsbToken);

        uint32 oldMaturityTime = loanInfo.maturityTime;
        (, uint32 newMaturityTime) = ITsbToken(rollBorrowOrder.tsbToken).tokenInfo();

        // assert: expireTime > block.timestamp && expireTime + 1 day <= old maturityTime
        // solhint-disable-next-line not-rely-on-time
        if (rollBorrowOrder.expiredTime <= block.timestamp) revert InvalidExpiredTime(rollBorrowOrder.expiredTime);
        if (rollBorrowOrder.expiredTime + Config.LAST_ROLL_ORDER_TIME_TO_MATURITY > oldMaturityTime)
            revert InvalidExpiredTime(rollBorrowOrder.expiredTime);

        // check new maturity time is valid (new maturity time > old maturity time)
        if (newMaturityTime <= oldMaturityTime) revert InvalidMaturityTime(newMaturityTime);

        // check the loan is not locked
        if (loanInfo.loan.lockedCollateralAmt > 0) revert LoanIsLocked(loanId);

        return newMaturityTime;
    }

    //! mainnet-audit
    /// @notice Internal function to roll borrow
    /// @dev Should simulate this roll borrow order before being matched in L2,
    ///      to make sure both the original and new loan are strictly healthy (buffering to liquidation threshold)
    /// @param lsl The loan storage layout
    /// @param rollBorrowOrder The roll borrow order
    /// @param loanInfo The loan info
    /// @param caller The caller to roll borrow the loan
    /// @param loanOwner The loan owner
    /// @param loanId The loan id
    /// @param newMaturityTime The maturity time of the new loan after roll borrow
    function _rollBorrow(
        LoanStorage.Layout storage lsl,
        RollBorrowOrder memory rollBorrowOrder,
        LoanInfo memory loanInfo,
        address caller,
        address loanOwner,
        bytes12 loanId,
        uint32 newMaturityTime
    ) internal {
        AssetConfig memory collateralAsset;
        AssetConfig memory debtAsset;
        uint32 borrowFeeRate = lsl.getBorrowFeeRate();

        // {} scope to avoid stack too deep error
        {
            // interestRate = APR * (maturityTime - block.timestamp) / SECONDS_OF_ONE_YEAR
            uint32 maxInterestRate = rollBorrowOrder
                .maxAnnualPercentageRate
                // solhint-disable-next-line not-rely-on-time
                .mulDiv(newMaturityTime - block.timestamp, Config.SECONDS_OF_ONE_YEAR)
                .toUint32();

            // borrowFee = borrowAmt * (interestRate / SYSTEM_UNIT_BASE) * (borrowFeeRate / SYSTEM_UNIT_BASE)
            // ==> maxBorrowFee = maxBorrowAmt * (maxInterestRate / SYSTEM_UNIT_BASE) * (borrowFeeRate / SYSTEM_UNIT_BASE)
            uint128 maxBorrowFee = rollBorrowOrder
                .maxBorrowAmt
                .mulDiv(uint256(maxInterestRate) * borrowFeeRate, Config.SYSTEM_UNIT_BASE * Config.SYSTEM_UNIT_BASE)
                .toUint128();

            // debtAmt = borrowAmt + interest
            // ==> maxDebtAmt = maxBorrowAmt + maxBorrowAmt * maxInterestRate / SYSTEM_UNIT_BASE
            uint128 maxDebtAmt = rollBorrowOrder.maxBorrowAmt +
                rollBorrowOrder.maxBorrowAmt.mulDiv(maxInterestRate, Config.SYSTEM_UNIT_BASE).toUint128();

            // check the original loan will be strictly healthy after roll over
            Loan memory loan = loanInfo.loan;
            collateralAsset = loanInfo.collateralAsset;
            debtAsset = loanInfo.debtAsset;
            loan.repay(rollBorrowOrder.maxCollateralAmt, (rollBorrowOrder.maxBorrowAmt - maxBorrowFee));
            loan.requireStrictHealthy(loanInfo.liquidationFactor, collateralAsset, debtAsset);

            // reuse the original memory of `loan` to simulate the new loan after roll borrow
            loan = Loan({collateralAmt: rollBorrowOrder.maxCollateralAmt, lockedCollateralAmt: 0, debtAmt: maxDebtAmt});
            // check the new loan will be also strictly healthy
            // if the roll borrow order is executed in L2 then the position is be rollup to L1
            loan.requireStrictHealthy(loanInfo.liquidationFactor, collateralAsset, debtAsset);
        }

        // add the locked collateral to the original loan
        // however we only allow one roll borrow order existing for each loan
        lsl.loans[loanId].lockedCollateralAmt += rollBorrowOrder.maxCollateralAmt;

        (, , uint16 debtTokenId, uint16 collateralTokenId) = LoanLib.resolveLoanId(loanId);
        Operations.RollBorrow memory rollBorrowReq = Operations.RollBorrow({
            accountId: loanInfo.accountId,
            collateralTokenId: collateralTokenId,
            maxCollateralAmt: rollBorrowOrder.maxCollateralAmt.toL2Amt(collateralAsset.decimals),
            feeRate: borrowFeeRate,
            borrowTokenId: debtTokenId,
            maxBorrowAmt: rollBorrowOrder.maxBorrowAmt.toL2Amt(debtAsset.decimals),
            oldMaturityTime: loanInfo.maturityTime,
            newMaturityTime: newMaturityTime,
            expiredTime: rollBorrowOrder.expiredTime,
            maxPrincipalAndInterestRate: (rollBorrowOrder.maxAnnualPercentageRate + Config.SYSTEM_UNIT_BASE).toUint32() // convert APR to PIR (e.g. 5% APR => 105% PIR)
        });

        LoanLib.addRollBorrowReq(RollupStorage.layout(), loanOwner, rollBorrowReq);
        emit RollBorrowOrderPlaced(loanId, caller, loanOwner, rollBorrowReq);
    }

    //! mainnet-audit
    /// @notice Internal function to force cancel roll borrow
    /// @param lsl The loan storage layout
    /// @param caller The caller to force cancel roll borrow
    /// @param loanOwner The loan owner
    /// @param loanId The loan id to be forced cancel roll borrow
    /// @param accountId The account id of the loan owner
    /// @param debtTokenId The debt token id of the loan
    /// @param collateralTokenId The collateral token id of the loan
    /// @param maturityTime The maturity time of the original loan to be rolled over
    function _forceCancelRollBorrow(
        LoanStorage.Layout storage lsl,
        address caller,
        address loanOwner,
        bytes12 loanId,
        uint32 accountId,
        uint16 debtTokenId,
        uint16 collateralTokenId,
        uint32 maturityTime
    ) internal {
        Loan memory loan = lsl.getLoan(loanId);
        if (loan.lockedCollateralAmt == 0) revert LoanIsNotLocked(loanId);

        Operations.CancelRollBorrow memory forceCancelRollBorrowReq = Operations.CancelRollBorrow({
            accountId: accountId,
            debtTokenId: debtTokenId,
            collateralTokenId: collateralTokenId,
            maturityTime: maturityTime // the maturity time of the original loan to be rolled over
        });

        LoanLib.addForceCancelRollBorrowReq(RollupStorage.layout(), loanOwner, forceCancelRollBorrowReq);
        emit RollBorrowOrderForceCancelPlaced(loanId, caller, loanOwner);
    }

    /* ============ Internal Pure Functions to Calculate Struct Hash ============ */

    //! mainnet-audit
    /// @notice Calculate the hash of the struct for the remove collateral permit
    /// @param loanId The id of the loan
    /// @param amount The amount of the collateral to be added
    /// @param nonce The nonce of the permit
    /// @param deadline The deadline of the permit
    function _calcRemoveCollateralStructHash(
        bytes12 loanId,
        uint128 amount,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(REMOVE_COLLATERAL_TYPEHASH, loanId, amount, nonce, deadline));
    }

    //! mainnet-audit
    /// @notice Calculate the hash of the struct for the repay collateral permit
    /// @param loanId The id of the loan
    /// @param collateralAmt The amount of the collateral to be added
    /// @param debtAmt The amount of the debt to be repaid
    /// @param repayAndDeposit The flag to indicate whether to repay and deposit
    /// @param nonce The nonce of the permit
    /// @param deadline The deadline of the permit
    function _calcRepayStructHash(
        bytes12 loanId,
        uint128 collateralAmt,
        uint128 debtAmt,
        bool repayAndDeposit,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(REPAY_TYPEHASH, loanId, collateralAmt, debtAmt, repayAndDeposit, nonce, deadline));
    }

    //! mainnet-audit
    /// @notice Calculate the hash of the struct for the roll borrow permit
    /// @param rollBorrowOrder The roll borrow order
    /// @param nonce The nonce of the permit
    /// @param deadline The deadline of the permit
    function _calcRollBorrowStructHash(
        RollBorrowOrder memory rollBorrowOrder,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ROLL_BORROW_TYPEHASH,
                    rollBorrowOrder.loanId,
                    rollBorrowOrder.expiredTime,
                    rollBorrowOrder.maxAnnualPercentageRate,
                    rollBorrowOrder.maxCollateralAmt,
                    rollBorrowOrder.maxBorrowAmt,
                    rollBorrowOrder.tsbToken,
                    nonce,
                    deadline
                )
            );
    }

    //! mainnet-audit
    /// @notice Calculate the hash of the struct for the force cancel roll borrow permit
    /// @param loanId The id of the loan
    /// @param nonce The nonce of the permit
    /// @param deadline The deadline of the permit
    function _calcForceCancelRollBorrowStructHash(
        bytes12 loanId,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(FORCE_CANCEL_ROLL_BORROW_TYPEHASH, loanId, nonce, deadline));
    }

    //! mainnet-audit
    /// @notice Calculate the hash of the struct for the roll to AAVE permit
    /// @param loanId The id of the loan
    /// @param collateralAmt The amount of the collateral to be supplied to AAVE
    /// @param debtAmt The amount of the debt to be borrowed from AAVE
    /// @param nonce The nonce of the permit
    /// @param deadline The deadline of the permit
    function _calcRollToAaveStructHash(
        bytes12 loanId,
        uint128 collateralAmt,
        uint128 debtAmt,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(ROLL_TO_AAVE_TYPEHASH, loanId, collateralAmt, debtAmt, nonce, deadline));
    }
}
