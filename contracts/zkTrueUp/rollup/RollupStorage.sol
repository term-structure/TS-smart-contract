// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Operations} from "../libraries/Operations.sol";

/// @notice Stored block data (stored after block is committed)
struct StoredBlock {
    uint32 blockNumber;
    uint64 l1RequestNum;
    bytes32 pendingRollupTxHash;
    bytes32 commitment;
    bytes32 stateRoot;
    uint256 timestamp;
}

/// @notice Data needed to be committed (passed in by sequencer)
struct CommitBlock {
    uint32 blockNumber;
    bytes32 newStateRoot;
    bytes32 newTsRoot;
    uint256 timestamp;
    uint32[] publicDataOffsets;
    bytes publicData;
}

/// @notice Data needed to be executed (passed in by sequencer)
struct ExecuteBlock {
    StoredBlock storedBlock;
    bytes[] pendingRollupTxPubData;
}

/// @notice Data for verifying block
struct Proof {
    uint256[2] a;
    uint256[2][2] b;
    uint256[2] c;
    uint256[1] commitment;
}

/// @dev The priority request needs to be executed before the expirationBlock, or the system will enter the evacuation mode
struct L1Request {
    Operations.OpType opType;
    uint64 expirationBlock;
    bytes32 hashedPubData;
}

/**
 * @title Term Structure Rollup Storage
 */
library RollupStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTrueUp.contracts.storage.Rollup")) - 1);

    struct Layout {
        /// @notice Mode of evacuation (true: evacuation mode, false: normal mode)
        bool evacuMode;
        /// @notice Total number of committed blocks
        uint32 committedBlockNum;
        /// @notice Total number of verified blocks
        uint32 verifiedBlockNum;
        /// @notice Total number of executed blocks
        uint32 executedBlockNum;
        /// @notice The total number of committed L1 requests
        uint64 committedL1RequestNum;
        /// @notice The total number of executed L1 requests
        uint64 executedL1RequestNum;
        /// @notice The total number of L1 requests including pending ones
        uint64 totalL1RequestNum;
        /// @notice L1 request queue
        mapping(uint64 => L1Request) l1RequestQueue;
        /// @notice pending balances for withdrawal
        mapping(bytes22 => uint128) pendingBalances;
        /// @notice Stored hashed StoredBlock for some block number
        mapping(uint32 => bytes32) storedBlockHashes;
        /// @notice Mapping of L2 Account Id => L2 Token Id => isEvacuated
        mapping(uint32 => mapping(uint16 => bool)) evacuated;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
