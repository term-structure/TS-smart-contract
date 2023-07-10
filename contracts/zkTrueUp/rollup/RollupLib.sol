// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {RollupStorage, L1Request} from "./RollupStorage.sol";
import {Config} from "../libraries/Config.sol";
import {Operations} from "../libraries/Operations.sol";

/**
 * @title Term Structure Rollup Library
 */
library RollupLib {
    using RollupLib for RollupStorage.Layout;

    /// @notice Error for withdraw amount exceed pending balance
    error WithdrawAmtExceedPendingBalance(uint256 pendingBalance, uint128 withdrawAmt);
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
    /// @param expirationTime The expiration time of the request
    event NewL1Request(
        address indexed sender,
        uint64 requestId,
        Operations.OpType opType,
        bytes pubData,
        uint32 expirationTime
    );

    /// @notice Add the L1 request into L1 request queue
    /// @dev The pubData will be hashed with keccak256 and store in the priority queue with its expiration block and operation type
    /// @param s The rollup storage
    /// @param sender The address of sender
    /// @param opType The operation type of the priority request
    /// @param pubData The public data of the priority request
    function addL1Request(
        RollupStorage.Layout storage s,
        address sender,
        Operations.OpType opType,
        bytes memory pubData
    ) internal {
        uint32 expirationTime = uint32(block.timestamp + Config.EXPIRATION_PERIOD);
        uint64 nextL1RequestId = s.totalL1RequestNum;
        bytes32 hashedPubData = keccak256(pubData);
        s.l1RequestQueue[nextL1RequestId] = L1Request({
            hashedPubData: hashedPubData,
            expirationTime: expirationTime,
            opType: opType
        });
        s.totalL1RequestNum++;
        emit NewL1Request(sender, nextL1RequestId, opType, pubData, expirationTime);
    }

    /// @notice Update pending balance and emit Withdraw event
    /// @param s The rollup storage
    /// @param sender The address of the sender
    /// @param tokenId The token id on layer2
    /// @param amount The amount of the token
    function updateWithdrawalRecord(
        RollupStorage.Layout storage s,
        address sender,
        uint16 tokenId,
        uint128 amount
    ) internal {
        bytes22 key = getPendingBalanceKey(sender, tokenId);
        uint256 pendingBalance = s.getPendingBalances(key);
        if (pendingBalance < amount) revert WithdrawAmtExceedPendingBalance(pendingBalance, amount);
        unchecked {
            RollupStorage.layout().pendingBalances[key] = pendingBalance - amount;
        }
    }

    /// @notice Internal function to check if the contract is not in the evacuMode
    /// @param s The rollup storage
    function requireActive(RollupStorage.Layout storage s) internal view {
        if (s.isEvacuMode()) revert EvacuModeActivated();
    }

    /// @notice Internal function to get evacuation mode status
    /// @param s The rollup storage
    /// @return evacuMode The evacuation mode status
    function isEvacuMode(RollupStorage.Layout storage s) internal view returns (bool) {
        return s.evacuMode;
    }

    /// @notice Internal function to get whether the specified accountId and tokenId is evacuated
    /// @param s The rollup storage
    /// @param accountId The account id
    /// @param tokenId The token id
    /// @return isEvacuated Whether the specified accountId and tokenId is evacuated
    function isEvacuated(
        RollupStorage.Layout storage s,
        uint32 accountId,
        uint16 tokenId
    ) internal view returns (bool) {
        return s.evacuated[accountId][tokenId];
    }

    /// @notice Internal function to get the L1 request of the specified id
    /// @param s The rollup storage
    /// @param requestId The id of the specified request
    /// @return request The request of the specified id
    function getL1Request(RollupStorage.Layout storage s, uint64 requestId) internal view returns (L1Request memory) {
        return s.l1RequestQueue[requestId];
    }

    /// @notice Internal function to get the number of committed L1 request
    /// @param s The rollup storage
    /// @return committedL1RequestNum The number of committed L1 requests
    function getCommittedL1RequestNum(RollupStorage.Layout storage s) internal view returns (uint64) {
        return s.committedL1RequestNum;
    }

    /// @notice Internal function to get the number of executed L1 request
    /// @param s The rollup storage
    /// @return executedL1RequestNum The number of executed L1 requests
    function getExecutedL1RequestNum(RollupStorage.Layout storage s) internal view returns (uint64) {
        return s.executedL1RequestNum;
    }

    /// @notice Internal function to get the total number of L1 request
    /// @param s The rollup storage
    /// @return totalL1RequestNum The total number of L1 requests
    function getTotalL1RequestNum(RollupStorage.Layout storage s) internal view returns (uint64) {
        return s.totalL1RequestNum;
    }

    /// @notice Internal function to get the number of committed block
    /// @param s The rollup storage
    /// @return committedBlockNum The number of committed block
    function getCommittedBlockNum(RollupStorage.Layout storage s) internal view returns (uint32) {
        return s.committedBlockNum;
    }

    /// @notice Internal function to get the number of verified block
    /// @param s The rollup storage
    /// @return verifiedBlockNum The number of verified block
    function getVerifiedBlockNum(RollupStorage.Layout storage s) internal view returns (uint32) {
        return s.verifiedBlockNum;
    }

    /// @notice Internal function to get the number of executed block
    /// @param s The rollup storage
    /// @return executedBlockNum The number of executed block
    function getExecutedBlockNum(RollupStorage.Layout storage s) internal view returns (uint32) {
        return s.executedBlockNum;
    }

    /// @notice Internal function to get the stored block hash
    /// @param s The rollup storage
    /// @param blockNum The block number
    /// @return storedBlockHash The stored block hash
    function getStoredBlockHash(RollupStorage.Layout storage s, uint32 blockNum) internal view returns (bytes32) {
        return s.storedBlockHashes[blockNum];
    }

    /// @notice Internal function to get the pending balance of the specified key
    /// @param s The rollup storage
    /// @param key The key of the pending balance
    /// @return pendingBalances The pending balance of the specified key
    function getPendingBalances(RollupStorage.Layout storage s, bytes22 key) internal view returns (uint256) {
        return s.pendingBalances[key];
    }

    /// @notice Internal function to check whether the request id is greater than the current request number
    /// @param s The rollup storage
    /// @param requestId The id of the request
    /// @return bool Return true is the request id is greater than the current request number, else return false
    function isRequestIdGtCurRequestNum(RollupStorage.Layout storage s, uint64 requestId) internal view returns (bool) {
        uint64 curRequestNum = s.getTotalL1RequestNum();
        return requestId >= curRequestNum;
    }

    /// @notice Internal function to check whether the register request is in the L1 request queue
    /// @param register The register request
    /// @param request The L1 request
    /// @return bool if the register request is in the L1 request queue
    function isRegisterInL1RequestQueue(
        Operations.Register memory register,
        L1Request memory request
    ) internal pure returns (bool) {
        requireMatchedOpType(request.opType, Operations.OpType.REGISTER);
        if (Operations.isRegisterHashedPubDataMatched(register, request.hashedPubData)) return true;
        return false;
    }

    /// @notice Internal function to check whether the deposit request is in the L1 request queue
    /// @param deposit The deposit request
    /// @param request The L1 request
    /// @return bool if the deposit request is in the L1 request queue
    function isDepositInL1RequestQueue(
        Operations.Deposit memory deposit,
        L1Request memory request
    ) internal pure returns (bool) {
        requireMatchedOpType(request.opType, Operations.OpType.DEPOSIT);
        if (Operations.isDepositHashedPubDataMatched(deposit, request.hashedPubData)) return true;
        return false;
    }

    /// @notice Internal function to check whether the force withdraw request is in the L1 request queue
    /// @param forceWithdraw The force withdraw request
    /// @param request The L1 request
    /// @return bool if the force withdraw request is in the L1 request queue
    function isForceWithdrawInL1RequestQueue(
        Operations.ForceWithdraw memory forceWithdraw,
        L1Request memory request
    ) internal pure returns (bool) {
        requireMatchedOpType(request.opType, Operations.OpType.FORCE_WITHDRAW);
        if (Operations.isForceWithdrawHashedPubDataMatched(forceWithdraw, request.hashedPubData)) return true;
        return false;
    }

    /// @notice Internal function to check whether the evacuation is in the L1 request queue
    /// @param evacuation The evacuation request
    /// @param request The L1 request
    /// @return bool if the evacuation request is in the L1 request queue
    function isEvacuationInL1RequestQueue(
        Operations.Evacuation memory evacuation,
        L1Request memory request
    ) internal pure returns (bool) {
        requireMatchedOpType(request.opType, Operations.OpType.EVACUATION);
        if (Operations.isEvacuationHashedPubDataMatched(evacuation, request.hashedPubData)) return true;
        return false;
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

    /// @notice Internal function to get rollup storage layout
    /// @return rollupStorage The rollup storage layout
    function getRollupStorage() internal pure returns (RollupStorage.Layout storage) {
        return RollupStorage.layout();
    }
}
