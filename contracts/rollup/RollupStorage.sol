// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Operations} from "../libraries/Operations.sol";

/// @dev The priority request needs to be executed before the expirationBlock, or the system will enter the evacuation mode
struct L1Request {
    Operations.OpType opType;
    uint64 expirationBlock;
    bytes32 hashedPubData;
}

library RollupStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTureUp.contracts.storage.Rollup")) - 1);

    struct Layout {
        /// @notice L1 request queue
        mapping(uint64 => L1Request) l1RequestQueue;
        /// @notice pending balances for withdrawal
        mapping(bytes22 => uint128) pendingBalances;
        /// @notice The total number of executed L1 requests
        uint64 executedL1RequestNum;
        /// @notice The total number of committed L1 requests
        uint64 committedL1RequestNum;
        /// @notice The total number of L1 requests including pending ones
        uint64 totalL1RequestNum;
        /// @notice Stored hashed StoredBlock for some block number
        mapping(uint32 => bytes32) storedBlockHashes;
        /// @notice Total number of committed blocks
        uint32 committedBlockNum;
        /// @notice Total number of verified blocks
        uint32 verifiedBlockNum;
        /// @notice Total number of executed blocks
        uint32 executedBlockNum;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
