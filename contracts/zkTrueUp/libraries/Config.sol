// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title Config Library
 * @author Term Structure Labs
 * @notice Library for constants and configuration parameters
 */
library Config {
    /// @notice The default address of ETH
    address internal constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice The base of fund distribution weight of the protocol
    uint16 internal constant FUND_WEIGHT_BASE = 10000;

    /// @notice The health factor threshold
    /// @dev Constant value 1, and the decimals is 3
    /// @dev If health factor < HEALTH_FACTOR_THRESHOLD, the loan is liquidable
    uint16 internal constant HEALTH_FACTOR_THRESHOLD = 1000;

    /// @notice The base of LTV ratio
    uint16 internal constant LTV_BASE = 1000;

    /// @notice The max LTV ratio
    uint16 internal constant MAX_LTV_RATIO = 1000; // 100%

    /// @notice The base of flashloan premium
    uint16 internal constant FLASH_LOAN_PREMIUM_BASE = 10000;

    /// @notice The max amount of registered tokens
    uint32 internal constant MAX_AMOUNT_OF_REGISTERED_TOKENS = type(uint16).max;

    /// @notice The max amount of registered tokens
    uint32 internal constant MAX_AMOUNT_OF_REGISTERED_ACCOUNT = type(uint32).max;

    /// @notice Expriation period for L1 request
    uint256 internal constant EXPIRATION_PERIOD = 14 days;

    /// @notice Number of reserved accounts (reserved accountId 0 as default accountId)
    uint8 internal constant NUM_RESERVED_ACCOUNTS = 1;

    /// @notice Hash of empty string
    bytes32 internal constant EMPTY_STRING_KECCAK = keccak256("");

    /// @notice The Bits number of 1 byte
    uint8 internal constant BITS_OF_BYTE = 8;

    /// @notice The last index of 1 byte
    uint8 internal constant LAST_INDEX_OF_BYTE = BITS_OF_BYTE - 1;

    /// @notice The bytes lengths to represent operation type
    uint8 internal constant BYTES_OF_OP_TYPE = 1;

    /// @notice The bytes lengths of a chunk
    uint8 internal constant BYTES_OF_CHUNK = 12;

    /// @notice The bytes lengths of two chunks
    uint8 internal constant BYTES_OF_TWO_CHUNKS = 2 * BYTES_OF_CHUNK;

    /// @notice The bytes lengths of three chunks
    uint8 internal constant BYTES_OF_THREE_CHUNKS = 3 * BYTES_OF_CHUNK;

    /// @notice The bytes lengths of four chunks
    uint8 internal constant BYTES_OF_FOUR_CHUNKS = 4 * BYTES_OF_CHUNK;

    /// @notice The bits lengths of a chunk
    uint8 internal constant BITS_OF_CHUNK = BYTES_OF_CHUNK * BITS_OF_BYTE;

    /// @notice The chunk size of a evacuation request
    uint256 internal constant EVACUATION_CHUNK_SIZE = 2;

    /// @notice The evacuation commitment offset
    /// @dev 0x80 = 0b10000000 in binary, the first bit (critical chunk flag) is 1
    bytes internal constant EVACUATION_COMMITMENT_OFFSET = hex"80";

    /// @notice The max tolerance between the L2 block timestamp and the L1 block timestamp
    ///         i.e. the block created on L2 must be commit to L1 within 1 day
    uint256 internal constant COMMIT_BLOCK_TIMESTAMP_MAX_TOLERANCE = 1 days;

    /// @notice The max deviation between the L2 block timestamp and the L1 block timestamp
    ///         i.e. the L2 block timestamp cannot greater than the L1 block timestamp + 15 minutes
    uint256 internal constant COMMIT_BLOCK_TIMESTAMP_MAX_DEVIATION = 15 minutes;

    /// @notice The field modulus of bn254
    uint256 internal constant SCALAR_FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /// @notice The decimals of L2 system
    uint8 internal constant SYSTEM_DECIMALS = 8;

    /// @notice The base of L2 system unit
    uint256 internal constant SYSTEM_UNIT_BASE = 10 ** SYSTEM_DECIMALS;

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
    //! The current address is for sepolia testnet, need to update to mainnet address
    address internal constant AAVE_V3_POOL_ADDRESS = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;

    /// @notice Aave V3 referral code
    uint16 internal constant AAVE_V3_REFERRAL_CODE = 0;

    /// @notice Aave V3 interest rate mode
    uint256 internal constant AAVE_V3_INTEREST_RATE_MODE = 2;

    /// @notice The last roll borrow order time can place to maturity time
    uint256 internal constant LAST_ROLL_ORDER_TIME_TO_MATURITY = 1 days;

    /// @notice The seconds of one year
    uint256 internal constant SECONDS_OF_ONE_YEAR = 365 days;
}
