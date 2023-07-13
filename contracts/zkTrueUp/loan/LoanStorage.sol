// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AssetConfig} from "../token/TokenStorage.sol";

/// @notice Liquidation factor of the loan
/// @dev ltvThreshold: the threshold of the loan-to-value ratio,
///      if the ratio is higher than the threshold, the loan will be liquidated
///      the base is 1e3 (1000), i.e. 800 means 80%
/// @dev liquidatorIncentive: the incentive for liquidator if the loan is liquidated,
///      the liquidator will get the extra incentive equivalent to the collateral value
///      the base is 1e3 (1000), i.e. 50 means 5%
/// @dev protocolPenalty: the penalty for the protocol if the loan is liquidated,
///      the protocol will get the penalty equivalent to the collateral value
///      the base is 1e3 (1000), i.e. 50 means 5%
struct LiquidationFactor {
    uint16 ltvThreshold;
    uint16 liquidatorIncentive;
    uint16 protocolPenalty;
}

/// @notice Data of loan
struct Loan {
    uint128 debtAmt;
    uint128 collateralAmt;
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

/**
 * @title Term Structure Loan Storage
 */
library LoanStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTrueUp.contracts.storage.Loan")) - 1);

    struct Layout {
        /// @notice The flag to indicate the roll function is activated or not
        bool isActivatedRoller;
        /// @notice The half liquidation threshold, unit is US dollar
        ///         i.e. 10000 means 10000 usd
        uint16 halfLiquidationThreshold;
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
