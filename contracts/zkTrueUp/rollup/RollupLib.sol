// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {RollupStorage, L1Request} from "./RollupStorage.sol";
import {Config} from "../libraries/Config.sol";
import {Operations} from "../libraries/Operations.sol";

library RollupLib {
    /// @notice Error for withdraw amount exceed pending balance
    error WithdrawAmtExceedPendingBalance(uint128 pendingBalance, uint128 withdrawAmt);
    /// @notice Error for trying to do transactions when evacuation mode is activated
    error EvacuModeActivated();
    /// @notice Error for operation type is not matched
    error OpTypeIsNotMatched(Operations.OpType requestOpType, Operations.OpType expectedOpType);

    /// @notice Emit when there is a new priority request added
    /// @dev The L1 request needs to be executed before the expiration block or the system will enter the evacuation mode
    /// @param sender The address of the request sender
    /// @param requestId The id of the request
    /// @param opType The operation type of the request
    /// @param pubData The public data of the request
    /// @param expirationBlock The expiration block of the request
    event NewL1Request(
        address indexed sender,
        uint64 requestId,
        Operations.OpType opType,
        bytes pubData,
        uint64 expirationBlock
    );

    /// @notice Add the L1 request into L1 request queue
    /// @dev The pubData will be hashed with keccak256 and store in the priority queue with its expiration block and operation type
    /// @param sender The address of sender
    /// @param opType The operation type of the priority request
    /// @param pubData The public data of the priority request
    function addL1Request(address sender, Operations.OpType opType, bytes memory pubData) internal {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        uint64 expirationBlock = uint64(block.number + Config.EXPIRATION_BLOCK);
        uint64 nextL1RequestId = rsl.totalL1RequestNum;
        bytes32 hashedPubData = keccak256(pubData);
        rsl.l1RequestQueue[nextL1RequestId] = L1Request({
            hashedPubData: hashedPubData,
            expirationBlock: expirationBlock,
            opType: opType
        });
        rsl.totalL1RequestNum++;
        emit NewL1Request(sender, nextL1RequestId, opType, pubData, expirationBlock);
    }

    /// @notice Update pending balance and emit Withdraw event
    /// @param sender The address of the sender
    /// @param tokenId The token id on layer2
    /// @param amount The amount of the token
    function updateWithdrawalRecord(address sender, uint16 tokenId, uint128 amount) internal {
        bytes22 key = getPendingBalanceKey(sender, tokenId);
        uint128 pendingBalance = getPendingBalances(key);
        if (pendingBalance < amount) revert WithdrawAmtExceedPendingBalance(pendingBalance, amount);
        unchecked {
            RollupStorage.layout().pendingBalances[key] = pendingBalance - amount;
        }
    }

    /// @notice Internal function to check if the contract is not in the evacuMode
    function requireActive() internal view {
        if (isEvacuMode()) revert EvacuModeActivated();
    }

    /// @notice Internal function to get evacuation mode status
    /// @return evacuMode The evacuation mode status
    function isEvacuMode() internal view returns (bool) {
        return RollupStorage.layout().evacuMode;
    }

    /// @notice Internal function to get whether the specified accountId and tokenId is evacuated
    /// @param accountId The account id
    /// @param tokenId The token id
    /// @return isEvacuated Whether the specified accountId and tokenId is evacuated
    function isEvacuated(uint32 accountId, uint16 tokenId) internal view returns (bool) {
        return RollupStorage.layout().evacuated[accountId][tokenId];
    }

    /// @notice Internal function to get the L1 request of the specified id
    /// @param requestId The id of the specified request
    /// @return request The request of the specified id
    function getL1Request(uint64 requestId) internal view returns (L1Request memory) {
        return RollupStorage.layout().l1RequestQueue[requestId];
    }

    /// @notice Internal function to get the number of committed L1 request
    /// @return committedL1RequestNum The number of committed L1 requests
    function getCommittedL1RequestNum() internal view returns (uint64) {
        return RollupStorage.layout().committedL1RequestNum;
    }

    /// @notice Internal function to get the number of executed L1 request
    /// @return executedL1RequestNum The number of executed L1 requests
    function getExecutedL1RequestNum() internal view returns (uint64) {
        return RollupStorage.layout().executedL1RequestNum;
    }

    /// @notice Internal function to get the total number of L1 request
    /// @return totalL1RequestNum The total number of L1 requests
    function getTotalL1RequestNum() internal view returns (uint64) {
        return RollupStorage.layout().totalL1RequestNum;
    }

    /// @notice Internal function to get the number of committed block
    /// @return committedBlockNum The number of committed block
    function getCommittedBlockNum() internal view returns (uint32) {
        return RollupStorage.layout().committedBlockNum;
    }

    /// @notice Internal function to get the number of verified block
    /// @return verifiedBlockNum The number of verified block
    function getVerifiedBlockNum() internal view returns (uint32) {
        return RollupStorage.layout().verifiedBlockNum;
    }

    /// @notice Internal function to get the number of executed block
    /// @return executedBlockNum The number of executed block
    function getExecutedBlockNum() internal view returns (uint32) {
        return RollupStorage.layout().executedBlockNum;
    }

    /// @notice Internal function to get the stored block hash
    /// @param blockNum The block number
    /// @return storedBlockHash The stored block hash
    function getStoredBlockHash(uint32 blockNum) internal view returns (bytes32) {
        return RollupStorage.layout().storedBlockHashes[blockNum];
    }

    /// @notice Internal function to get the pending balance of the specified key
    /// @param key The key of the pending balance
    /// @return pendingBalances The pending balance of the specified key
    function getPendingBalances(bytes22 key) internal view returns (uint128) {
        return RollupStorage.layout().pendingBalances[key];
    }

    /// @notice Internal function check if the operation type is matched
    /// @param opType The operation type of the request
    /// @param expectedOpType The expected operation type
    function requireMatchedOpType(Operations.OpType opType, Operations.OpType expectedOpType) internal pure {
        if (opType != expectedOpType) revert OpTypeIsNotMatched(opType, expectedOpType);
    }

    /// @notice Internal function to get the key of pending balance
    /// @param addr The user address
    /// @param tokenId The token id
    /// @return pendingBalanceKey The key of pending balance
    function getPendingBalanceKey(address addr, uint16 tokenId) internal pure returns (bytes22) {
        return bytes22((uint176(uint160(addr)) | (uint176(tokenId) << 160)));
    }
}
