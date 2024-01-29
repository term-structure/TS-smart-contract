// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title Initial Config Library
 * @author Term Structure Labs
 * @notice Initial configurations of the protocol
 */
library InitialConfig {
    /// @notice The initial weight of the treasury
    uint16 internal constant INIT_TREASURY_WEIGHT = 0.5e4; // 50%

    /// @notice The initial weight of the insurance fund
    uint16 internal constant INIT_INSURANCE_WEIGHT = 0.1e4; // 10%

    /// @notice The initial weight of the vault
    uint16 internal constant INIT_VAULT_WEIGHT = 0.4e4; // 40%

    /// @notice Initial half liquidation threshold
    /// @dev If the collateral value is larger than half liquidation threshold, the liquidator can only liquidate half of the loan
    uint16 internal constant INIT_HALF_LIQUIDATION_THRESHOLD = 10000; // 10000 USD

    /// @notice Initial threshold of liquidation LTV ratio, if the ratio is higher than the threshold, the loan will be liquidated
    uint16 internal constant INIT_LIQUIDATION_LTV_THRESHOLD = 0.8e3; // 80%

    /// @notice Initial threshold of borrow order LTV ratio, 5% buffer between liquidated LTV threshold and borrow order LTV threshold
    uint16 internal constant INIT_BORROW_ORDER_LTV_THRESHOLD = 0.75e3; // 75%

    /// @notice Initial threshold of stablecoin pair liquidation LTV ratio, if the ratio is higher than the threshold, the loan will be liquidated
    uint16 internal constant INIT_STABLECOIN_PAIR_LIQUIDATION_LTV_THRESHOLD = 0.925e3; // 92.5%

    /// @notice Initial threshold of stablecoin pair borrow order LTV ratio, 2.5% buffer between liquidated LTV threshold and borrow order LTV threshold
    uint16 internal constant INIT_STABLECOIN_PAIR_BORROW_ORDER_LTV_THRESHOLD = 0.9e3; // 90%

    /// @notice Initial liquidator incentive
    uint16 internal constant INIT_LIQUIDATOR_INCENTIVE = 0.05e3; // 5%

    /// @notice Initial stablecoin pair liquidator incentive
    uint16 internal constant INIT_STABLECOIN_PAIR_LIQUIDATOR_INCENTIVE = 0.03e3; // 3%

    /// @notice Initial protocol penalty
    uint16 internal constant INIT_PROTOCOL_PENALTY = 0.05e3; // 5%

    /// @notice Initial stablecoin pair protocol penalty
    uint16 internal constant INIT_STABLECOIN_PAIR_PROTOCOL_PENALTY = 0.015e3; // 1.5%

    /// @notice Initial flashloan premium
    uint16 internal constant INIT_FLASH_LOAN_PREMIUM = 0.0003e4; // 0.03%

    /// @notice Initial borrow fee rate of interest rate for borrower
    uint32 internal constant INIT_BORROW_FEE_RATE = 0.1e8; // 10% of interest rate

    /// @notice Initial roll over fee
    uint256 internal constant INIT_ROLL_OVER_FEE = 0.01 ether;
}
