// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

library Config {
    /// @notice The health factor threshold
    /// @dev Constant value 1, and the decimals is 3
    /// @dev If health factor < HEALTH_FACTOR_THRESHOLD, the loan is liquidatable
    uint16 internal constant HEALTH_FACTOR_THRESHOLD = 1000;

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
    /// @notice Initial half liquidation threshold
    /// @dev If the collateral value is larger than half liquidation threshold, the liquidator can only liquidate half of the loan
    uint16 internal constant INIT_HALF_LIQUIDATION_THRESHOLD = 10000; // 10000 USD

    /// @notice Initial flashloan premium
    uint16 internal constant INIT_FLASH_LOAN_PREMIUM = 3; // 0.03%
}
