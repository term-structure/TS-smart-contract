// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AssetConfig} from "../token/TokenStorage.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";

/// @notice Liquidation factor of the loan
/// @dev liquidationLtvThreshold: the liquidation threshold of the loan-to-value ratio,
///      if the ratio is higher than the threshold, the loan will be liquidated
///      the base is 1e3 (1000), i.e. 800 means 80%
/// @dev borrowOrderLtvThreshold: the borrow order threshold of the loan-to-value ratio,
///      the borrow order will be rejected if the ratio is higher than the threshold.
///      the base is 1e3 (1000), i.e. 750 means 75%,
///      buffer between liquidated LTV threshold and borrow order LTV threshold to avoid
///      liquidation immediately if LTV fluctuates too much after the borrow order and before create loan in rollup
/// @dev liquidatorIncentive: the incentive for liquidator if the loan is liquidated,
///      the liquidator will get the extra incentive equivalent to the collateral value
///      the base is 1e3 (1000), i.e. 50 means 5%
/// @dev protocolPenalty: the penalty for the protocol if the loan is liquidated,
///      the protocol will get the penalty equivalent to the collateral value
///      the base is 1e3 (1000), i.e. 50 means 5%
struct LiquidationFactor {
    uint16 liquidationLtvThreshold;
    uint16 borrowOrderLtvThreshold;
    uint16 liquidatorIncentive;
    uint16 protocolPenalty;
}

/// @notice Data of loan
struct Loan {
    uint128 collateralAmt;
    uint128 lockedCollateralAmt;
    uint128 debtAmt;
}

/// @notice The information of the loan
struct LoanInfo {
    Loan loan;
    uint32 maturityTime;
    uint32 accountId;
    LiquidationFactor liquidationFactor;
    AssetConfig collateralAsset;
    AssetConfig debtAsset;
}

/// @notice The amount of the liquidation
struct LiquidationAmt {
    uint128 liquidatorRewardAmt;
    uint128 protocolPenaltyAmt;
}

/// @notice The data of the roll borrow order
/// @dev maxAnnualPercentageRate means the maximum annual percentage rate that borrower can accept,
///      the actual annual percentage rate may be less than or equal to it when the order matched in L2
/// @dev maxCollateralAmt and maxBorrowAmt means the maximum amount that user want to roll,
///      but the actual amount of the roll borrow order may be less than or equal to the maximum amount
///      because of the partial fill in L2
struct RollBorrowOrder {
    bytes12 loanId;
    uint32 expiredTime;
    uint32 maxAnnualPercentageRate; // base is 1e8 (APR)
    uint128 maxCollateralAmt;
    uint128 maxBorrowAmt;
    address tsbTokenAddr; // the tsb token address of the new term of the loan
}

/**
 * @title Term Structure Loan Storage
 * @author Term Structure Labs
 */
library LoanStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTrueUp.contracts.storage.Loan")) - 1);

    struct Layout {
        /// @notice The flag to indicate the roll function is activated or not
        bool isActivatedRoller;
        /// @notice The half liquidation threshold, unit is US dollar
        ///         i.e. 10000 means 10000 usd
        uint16 halfLiquidationThreshold;
        /// @notice The fee rate for borrower, base is 1e8
        ///         i.e. 0.1e8 means 10% of the interest
        uint32 borrowerFeeRate;
        /// @notice LTV threshold for loans
        LiquidationFactor liquidationFactor;
        /// @notice LTV threshold for stable coin pairs' loans
        LiquidationFactor stableCoinPairLiquidationFactor;
        /// @notice Mapping from loan id to loan data
        mapping(bytes12 => Loan) loans;
    }

    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            s.slot := slot
        }
    }
}
