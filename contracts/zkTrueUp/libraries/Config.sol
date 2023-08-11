// SPDX-License-Identifier: MIT
// solhint-disable-next-line
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

    /// @notice The Bits number of 1 byte
    uint8 internal constant BITS_OF_BYTE = 8;

    /// @notice The last index of 1 byte
    uint8 internal constant LAST_INDEX_OF_BYTE = 7;

    /// @notice The max amount of registered tokens
    uint32 internal constant MAX_AMOUNT_OF_REGISTERED_TOKENS = type(uint16).max;

    /// @notice The max amount of registered tokens
    uint32 internal constant MAX_AMOUNT_OF_REGISTERED_ACCOUNT = type(uint32).max;

    /// @notice Expriation period for L1 request
    uint256 internal constant EXPIRATION_PERIOD = 14 days;

    /// @notice Number of reserved accountsx (reserved accountId 0 as default accountId)
    uint8 internal constant NUM_RESERVED_ACCOUNTS = 1;

    /// @notice Hash of empty string
    bytes32 internal constant EMPTY_STRING_KECCAK = keccak256("");

    /// @notice The bytes lengths of a chunk
    uint8 internal constant BYTES_OF_CHUNK = 12;

    /// @notice The bits lengths of a chunk
    uint8 internal constant BITS_OF_CHUNK = BYTES_OF_CHUNK * BITS_OF_BYTE;

    /// @notice The bytes lengths of register request
    uint256 internal constant REGISTER_BYTES = 3 * BYTES_OF_CHUNK;

    /// @notice The bytes lengths of deposit request
    uint256 internal constant DEPOSIT_BYTES = 2 * BYTES_OF_CHUNK;

    /// @notice The bytes lengths of withdraw request
    uint256 internal constant WITHDRAW_BYTES = 3 * BYTES_OF_CHUNK;

    /// @notice The bytes lengths of force withdraw request
    uint256 internal constant FORCE_WITHDRAW_BYTES = 2 * BYTES_OF_CHUNK;

    /// @notice The bytes lengths of auctionEnd request
    uint256 internal constant AUCTION_END_BYTES = 4 * BYTES_OF_CHUNK;

    /// @notice The bytes lengths of CreateTsbToken request
    uint256 internal constant CREATE_TSB_TOKEN_BYTES = 1 * BYTES_OF_CHUNK;

    /// @notice The bytes lengths of WithdrawFee request
    uint256 internal constant WITHDRAW_FEE_BYTES = 2 * BYTES_OF_CHUNK;

    /// @notice The bytes lengths of Evacuation request
    uint256 internal constant EVACUATION_BYTES = 2 * BYTES_OF_CHUNK;

    /// @notice The field modulus of bn254
    uint256 internal constant SCALAR_FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

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
