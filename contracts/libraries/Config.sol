// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

library Config {
    /// @notice The default address of ETH
    address internal constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice The health factor threshold
    /// @dev Constant value 1, and the decimals is 3
    /// @dev If health factor < HEALTH_FACTOR_THRESHOLD, the loan is liquidatable
    uint16 internal constant HEALTH_FACTOR_THRESHOLD = 1000;

    /// @notice The max LTV ratio
    uint16 internal constant MAX_LTV_RATIO = 1000; // 100%

    /// @notice The base of fund distribution weight of the protocol
    uint16 internal constant FUND_WEIGHT_BASE = 10000;

    /// @notice Role for admin
    bytes32 internal constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Role for operator
    bytes32 internal constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice Role for committer
    bytes32 internal constant COMMITTER_ROLE = keccak256("COMMITTER_ROLE");

    /// @notice Role for verifier
    bytes32 internal constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    /// @notice Role for executor
    bytes32 internal constant EXECUTER_ROLE = keccak256("EXECUTER_ROLE");
}

library InitConfig {
    /// @notice The initial weight of the treasury
    uint16 internal constant INIT_TREASURY_WEIGHT = 5000; // 50%

    /// @notice The initial weight of the insurance fund
    uint16 internal constant INIT_INSURANCE_WEIGHT = 1000; // 10%

    /// @notice The initial weight of the vault
    uint16 internal constant INIT_VAULT_WEIGHT = 4000; // 40%

    /// @notice Initial half liquidation threshold
    /// @dev If the collateral value is larger than half liquidation threshold, the liquidator can only liquidate half of the loan
    uint16 internal constant INIT_HALF_LIQUIDATION_THRESHOLD = 10000; // 10000 USD

    /// @notice Initial threshold of LTV ratio
    uint16 internal constant INIT_LTV_THRESHOLD = 800; // 80%

    /// @notice Initial liquidator incentive
    uint16 internal constant INIT_LIQUIDATOR_INCENTIVE = 50; // 5%

    /// @notice Initial protocol penalty
    uint16 internal constant INIT_PROTOCOL_PENALTY = 50; // 5%

    /// @notice Initial threshold of stablecoin pair LTV ratio
    uint16 internal constant INIT_STABLECOIN_PAIR_LTV_THRESHOLD = 925; // 92.5%

    /// @notice Initial stablecoin pair liquidator incentive
    uint16 internal constant INIT_STABLECOIN_PAIR_LIQUIDATOR_INCENTIVE = 30; // 3%

    /// @notice Initial stablecoin pair protocol penalty
    uint16 internal constant INIT_STABLECOIN_PAIR_PROTOCOL_PENALTY = 15; // 1.5%

    /// @notice Initial flashloan premium
    uint16 internal constant INIT_FLASH_LOAN_PREMIUM = 3; // 0.03%
}
