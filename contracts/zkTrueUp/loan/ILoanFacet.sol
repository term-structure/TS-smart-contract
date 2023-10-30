// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LiquidationFactor, Loan, RollBorrowOrder} from "./LoanStorage.sol";
import {Operations} from "../libraries/Operations.sol";

/**
 * @title Term Structure Loan Facet Interface
 * @author Term Structure Labs
 */
interface ILoanFacet {
    /// @notice Error for invalid tsb token address
    error InvalidTsbTokenAddr(address tsbTokenAddr);
    /// @notice Error for invalid expiration time
    error InvalidExpiredTime(uint32 expiredTime);
    /// @notice Error for setting invalid liquidation factor
    error InvalidLiquidationFactor(LiquidationFactor liquidationFactor);
    /// @notice Error for liquidate the loan which is safe
    error LoanIsSafe(uint256 healthFactor, uint32 maturityTime);
    /// @notice Error for liquidate the loan with invalid repay amount
    error RepayAmtExceedsMaxRepayAmt(uint128 repayAmt, uint128 maxRepayAmt);
    /// @notice Error for supply to Aave with string reason
    error SupplyToAaveFailedLogString(IERC20 collateralToken, uint128 collateralAmt, string reason);
    /// @notice Error for supply to Aave with bytes reason
    error SupplyToAaveFailedLogBytes(IERC20 collateralToken, uint128 collateralAmt, bytes reason);
    /// @notice Error for borrow from Aave with string reason
    error BorrowFromAaveFailedLogString(
        IERC20 collateralToken,
        uint128 collateralAmt,
        IERC20 debtToken,
        uint128 debtAmt,
        string reason
    );
    /// @notice Error for borrow from Aave with bytes reason
    error BorrowFromAaveFailedLogBytes(
        IERC20 collateralToken,
        uint128 collateralAmt,
        IERC20 debtToken,
        uint128 debtAmt,
        bytes reason
    );
    /// @notice Error for use roll when it is not activated
    error RollIsNotActivated();
    /// @notice Error for roll borrow a locked loan
    error LoanIsLocked(bytes12 loanId);
    /// @notice Error for roll borrow with invalid roll borrow fee
    error InvalidRollBorrowFee(uint256 rollBorrowFee);

    /// @notice Emitted when borrower add collateral
    /// @param loanId The id of the loan
    /// @param sender The address of the sender
    /// @param collateralToken The collateral token to add
    /// @param addedCollateralAmt The amount of the added collateral
    event CollateralAdded(
        bytes12 indexed loanId,
        address indexed sender,
        IERC20 collateralToken,
        uint128 addedCollateralAmt
    );

    /// @notice Emitted when borrower remove collateral
    /// @param loanId The id of the loan
    /// @param sender The address of the sender
    /// @param collateralToken The collateral token to remove
    /// @param removedCollateralAmt The amount of the removed collateral
    event CollateralRemoved(
        bytes12 indexed loanId,
        address indexed sender,
        IERC20 collateralToken,
        uint128 removedCollateralAmt
    );

    /// @notice Emitted when the borrower repay the loan
    /// @param loanId The id of the loan
    /// @param sender The address of the sender
    /// @param collateralToken The collateral token to be taken
    /// @param debtToken The debt token to be repaid
    /// @param removedCollateralAmt The amount of the removed collateral
    /// @param removedDebtAmt The amount of the removed debt
    /// @param repayAndDeposit Whether to deposit the collateral after repay the loan
    event Repayment(
        bytes12 indexed loanId,
        address indexed sender,
        IERC20 collateralToken,
        IERC20 debtToken,
        uint128 removedCollateralAmt,
        uint128 removedDebtAmt,
        bool repayAndDeposit
    );

    /// @notice Emitted when the loan is rolled to Aave
    /// @param loanId The id of the loan
    /// @param sender The address of the sender
    /// @param supplyToken The token to be supplied to Aave
    /// @param borrowToken The token to be borrowed from Aave
    /// @param collateralAmt The amount of the collateral
    /// @param debtAmt The amount of the debt
    event RollToAave(
        bytes12 indexed loanId,
        address indexed sender,
        IERC20 supplyToken,
        IERC20 borrowToken,
        uint128 collateralAmt,
        uint128 debtAmt
    );

    /// @notice Emitted when the borrower place a roll borrow order
    /// @param sender The address of the sender
    /// @param rollBorrowReq The roll borrow request
    event RollBorrowOrderPlaced(address indexed sender, Operations.RollBorrow rollBorrowReq);

    /// @notice Emitted when the loan is liquidated
    /// @param loanId The id of the loan
    /// @param liquidator The address of the liquidator
    /// @param collateralToken The collateral token to be taken
    /// @param liquidatorReward The reward of the liquidator
    /// @param protocolPenalty The penalty of the protocol
    event Liquidation(
        bytes12 indexed loanId,
        address indexed liquidator,
        IERC20 collateralToken,
        uint128 liquidatorReward,
        uint128 protocolPenalty
    );

    /// @notice Emitted when the half liquidation threshold is set
    /// @param halfLiquidationThreshold The half liquidation threshold
    event SetHalfLiquidationThreshold(uint16 indexed halfLiquidationThreshold);

    /// @notice Emitted when the liquidation factor is set
    /// @param liquidationFactor The liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    event SetLiquidationFactor(LiquidationFactor indexed liquidationFactor, bool indexed isStableCoinPair);

    /// @notice Emitted when the roll activation is set
    /// @param isActivatedRoll Whether the roll activation is set
    event SetActivatedRoller(bool isActivatedRoll);

    /// @notice Emitted when the borrow fee rate is set
    /// @param borrowFeeRate The borrow fee rate
    event SetBorrowFeeRate(uint32 indexed borrowFeeRate);

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

    /// @notice Roll the loan to Aave
    /// @param loanId The id of the loan
    /// @param collateralAmt The amount of collateral to be returned
    /// @param debtAmt The amount of debt to be repaid
    function rollToAave(bytes12 loanId, uint128 collateralAmt, uint128 debtAmt) external;

    /// @notice Place a roll borrow order
    /// @notice User want to roll the original loan to a new loan without repay
    /// @notice The roll borrow is an action to place a borrow order on L1,
    ///         and the order is waiting to be matched on L2 and rollup will create a new loan on L1 once matched
    /// @param rollBorrowOrder The roll borrow order
    function rollBorrow(RollBorrowOrder memory rollBorrowOrder) external payable;

    /// @notice Cancel the roll borrow order
    /// @notice User can force cancel their roll borrow order on L1
    ///         to avoid sequencer ignore his cancel request in L2
    /// @param loanId The id of the loan
    function forceCancelRollBorrow(bytes12 loanId) external;

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
    /// @dev The half liquidation threshold is the threshold of the liquidation price (USD),
    ///      the initial value 1e4 i.e. 10000 USD
    /// @param halfLiquidationThreshold The half liquidation threshold
    function setHalfLiquidationThreshold(uint16 halfLiquidationThreshold) external;

    /// @notice Set the liquidation factor
    /// @param liquidationFactor The liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    function setLiquidationFactor(LiquidationFactor memory liquidationFactor, bool isStableCoinPair) external;

    /// @notice Set the roll function activation
    /// @param isActivated The roll function activation
    function setActivatedRoller(bool isActivated) external;

    /// @notice Set the borrow fee rate
    /// @param borrowFeeRate The borrow fee rate
    function setBorrowFeeRate(uint32 borrowFeeRate) external;

    /// @notice Return the health factor of the loan
    /// @param loanId The id of the loan
    /// @return healthFactor The health factor of the loan
    function getHealthFactor(bytes12 loanId) external view returns (uint256 healthFactor);

    /// @notice Return the half liquidation threshold
    /// @dev The halfLiquidationThreshold is the threshold of the liquidation price (USD), i.e. 1e4 = 10000 USD
    /// @return halfLiquidationThreshold The half liquidation threshold
    function getHalfLiquidationThreshold() external view returns (uint16 halfLiquidationThreshold);

    /// @notice Return the liquidation factor
    /// @param isStableCoinPair Whether the liquidation factor is for stablecoin pair
    /// @return liquidationFactor The liquidation factor
    function getLiquidationFactor(
        bool isStableCoinPair
    ) external view returns (LiquidationFactor memory liquidationFactor);

    /// @notice Return the loan by the loan id
    /// @param loanId The id of the loan
    /// @return loan The loan
    function getLoan(bytes12 loanId) external view returns (Loan memory loan);

    /// @notice Return the liquidation info of the loan
    /// @param loanId The id of the loan
    /// @return _isLiquidable Whether the loan is liquidable
    /// @return debtToken The debt token of the loan
    /// @return maxRepayAmt The maximum amount of the debt to be repaid
    function getLiquidationInfo(
        bytes12 loanId
    ) external view returns (bool _isLiquidable, IERC20 debtToken, uint128 maxRepayAmt);

    /// @notice Return the borrow fee rate
    /// @return borrowFeeRate The borrow fee rate
    function getBorrowFeeRate() external view returns (uint32);

    /// @notice Check if the roll function is activated
    /// @return isActivate If the roll function is activated
    function isActivatedRoller() external view returns (bool isActivate);

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

    /// @notice Resolve the loan id
    /// @param loanId The loan id
    /// @return accountId The account id
    /// @return maturityTime The maturity time
    /// @return debtTokenId The debt token id
    /// @return collateralTokenId The collateral token id
    function resolveLoanId(
        bytes12 loanId
    ) external pure returns (uint32 accountId, uint32 maturityTime, uint16 debtTokenId, uint16 collateralTokenId);
}
