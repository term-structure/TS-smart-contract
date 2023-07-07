// SPDX-License-Identifier: MIT
// solhint-disable-next-line
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

    /// @notice Initial threshold of LTV ratio
    uint16 internal constant INIT_LTV_THRESHOLD = 0.8e3; // 80%

    /// @notice Initial threshold of stablecoin pair LTV ratio
    uint16 internal constant INIT_STABLECOIN_PAIR_LTV_THRESHOLD = 0.925e3; // 92.5%

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
}
