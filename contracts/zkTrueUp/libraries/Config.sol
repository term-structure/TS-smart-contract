// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

/**
 * @title Term Structure Config Library
 */
library Config {
    /// @notice The default address of ETH
    address internal constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice Number of reserved accountsx (reserved accountId 0 as default accountId)
    uint8 internal constant NUM_RESERVED_ACCOUNTS = 1;

    /// @notice The max amount of registered tokens
    uint32 internal constant MAX_AMOUNT_OF_REGISTERED_ACCOUNT = type(uint32).max;

    /// @notice The max amount of registered tokens
    uint32 internal constant MAX_AMOUNT_OF_REGISTERED_TOKENS = type(uint16).max;

    /// @notice Expected average period of block creation
    uint256 internal constant BLOCK_PERIOD = 15 seconds;

    /// @notice Expriation period for L1 request
    uint256 internal constant EXPIRATION_PERIOD = 14 days;

    /// @notice Expiration block for L1 request
    uint256 internal constant EXPIRATION_BLOCK = EXPIRATION_PERIOD / BLOCK_PERIOD;

    /// @notice Hash of empty string = keccak256("")
    bytes32 internal constant EMPTY_STRING_KECCAK = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470;

    /// @notice The bytes lengths of a chunk
    uint8 internal constant CHUNK_BYTES = 12;

    /// @notice The bytes lengths of register request
    uint256 internal constant REGISTER_BYTES = 4 * CHUNK_BYTES;

    /// @notice The bytes lengths of deposit request
    uint256 internal constant DEPOSIT_BYTES = 2 * CHUNK_BYTES;

    /// @notice The bytes lengths of withdraw request
    uint256 internal constant WITHDRAW_BYTES = 2 * CHUNK_BYTES;

    /// @notice The bytes lengths of force withdraw request
    uint256 internal constant FORCE_WITHDRAW_BYTES = 2 * CHUNK_BYTES;

    /// @notice The bytes lengths of auctionEnd request
    uint256 internal constant AUCTION_END_BYTES = 4 * CHUNK_BYTES;

    /// @notice The bytes lengths of CreateTsbToken request
    uint256 internal constant CREATE_TSB_TOKEN_BYTES = 1 * CHUNK_BYTES;

    /// @notice The bytes lengths of WithdrawFee request
    uint256 internal constant WITHDRAW_FEE_BYTES = 2 * CHUNK_BYTES;

    /// @notice The bytes lengths of Evacuation request
    uint256 internal constant EVACUATION_BYTES = 2 * CHUNK_BYTES;

    /// @notice The mask for commitment
    uint256 internal constant INPUT_MASK = (type(uint256).max >> 3);

    /// @notice The health factor threshold
    /// @dev Constant value 1, and the decimals is 3
    /// @dev If health factor < HEALTH_FACTOR_THRESHOLD, the loan is liquidatable
    uint16 internal constant HEALTH_FACTOR_THRESHOLD = 1000;

    /// @notice The max LTV ratio
    uint16 internal constant MAX_LTV_RATIO = 1000; // 100%

    /// @notice The base of LTV ratio
    uint16 internal constant LTV_BASE = 1000;

    /// @notice The base of flashloan premium
    uint16 internal constant FLASH_LOAN_PREMIUM_BASE = 10000;

    /// @notice The base of fund distribution weight of the protocol
    uint16 internal constant FUND_WEIGHT_BASE = 10000;

    /// @notice The decimals of L2 system
    uint8 internal constant SYSTEM_DECIMALS = 8;

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

    /// @notice Aave V3 pool address
    address internal constant AAVE_V3_POOL_ADDRESS = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;

    /// @notice Aave V3 referral code
    uint16 internal constant AAVE_V3_REFERRAL_CODE = 0;

    /// @notice Aave V3 interest rate mode
    uint256 internal constant AAVE_V3_INTEREST_RATE_MODE = 2;
}

/**
 * @title Term Structure Initial Config Library
 */
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
