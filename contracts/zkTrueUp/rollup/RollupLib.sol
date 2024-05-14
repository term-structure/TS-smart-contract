// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IVerifier} from "../interfaces/IVerifier.sol";
import {AccountStorage} from "../account/AccountStorage.sol";
import {TokenStorage, AssetConfig} from "../token/TokenStorage.sol";
import {RollupStorage, Request, StoredBlock, CommitBlock, Proof} from "./RollupStorage.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {Config} from "../libraries/Config.sol";
import {Operations} from "../libraries/Operations.sol";
import {Utils} from "../libraries/Utils.sol";

/**
 * @title Term Structure Rollup Library
 * @author Term Structure Labs
 */
library RollupLib {
    using TokenLib for TokenStorage.Layout;
    using AccountLib for AccountStorage.Layout;
    using RollupLib for RollupStorage.Layout;
    using Utils for *;

    /// @notice Error for withdraw amount exceed pending balance
    error InsufficientPendingBalances(uint256 pendingBalance, uint256 withdrawAmt);
    /// @notice Error for operation type is not matched
    error OpTypeIsNotMatched(Operations.OpType requestOpType, Operations.OpType expectedOpType);
    /// @notice Error for block hash is not equal
    error BlockHashIsNotEq(uint32 blockNum, StoredBlock storedBlock);
    /// @notice Error for invalid block number
    error InvalidBlockNum(uint32 newBlockNum, uint32 lastBlockNum);
    /// @notice Error for new block timestamp is less than last block timestamp
    error TimestampLtPreviousBlock(uint256 newBlockTimestamp, uint256 lastBlockTimestamp);
    /// @notice Error for block timestamp is not in the valid range
    error InvalidBlockTimestamp(uint256 l2BlockTimestamp, uint256 l1BlockTimestamp);
    /// @notice Error for invalid invalid public data length
    error InvalidPubDataLength(uint256 pubDataLength);
    /// @notice Error for evacuate but haven't consumed all L1 requests
    error NotConsumedAllL1Requests(uint64 executedL1RequestNum, uint64 totalL1RequestNum);
    /// @notice Error for inconsistent commitment
    error CommitmentInconsistant(uint256 proofCommitment, uint256 committedBlockcommitment);
    /// @notice Error for invalid proof
    error InvalidProof(Proof proof);

    /// @notice Emit when there is a new priority request added
    /// @dev The L1 request needs to be executed before the expiration block or the system will enter the evacuation mode
    /// @param sender The address of the request sender
    /// @param requestId The id of the request
    /// @param opType The operation type of the request
    /// @param pubData The public data of the request
    /// @param expirationTime The expiration time of the request
    event L1Request(
        address indexed sender,
        uint64 requestId,
        Operations.OpType opType,
        bytes pubData,
        uint32 expirationTime
    );

    /// @notice Internal function to verify one block
    /// @param commitment The commitment of the block
    /// @param proof The proof of the block
    /// @param verifier The verifier contract
    ///        if the block is normal block, use the AddressStorage.verifier (for normal circuit)
    ///        if the block is evacuation block, use the AddressStorage.evacuVerifier (for evacuation circuit)
    function verifyOneBlock(bytes32 commitment, Proof calldata proof, IVerifier verifier) internal view {
        if (proof.commitment[0] != uint256(commitment) % Config.SCALAR_FIELD_SIZE)
            revert CommitmentInconsistant(proof.commitment[0], uint256(commitment));

        if (!verifier.verifyProof(proof.a, proof.b, proof.c, proof.commitment)) revert InvalidProof(proof);
    }

    /// @notice Add the L1 request into L1 request queue
    /// @dev The pubData will be hashed with keccak256 and store in the priority queue with its expiration block and operation type
    /// @param s The rollup storage
    /// @param accountAddr The L1 address
    /// @param opType The operation type of the priority request
    /// @param pubData The public data of the priority request
    function addL1Request(
        RollupStorage.Layout storage s,
        address accountAddr,
        Operations.OpType opType,
        bytes memory pubData
    ) internal {
        // solhint-disable-next-line not-rely-on-time
        uint32 expirationTime = uint32(block.timestamp + Config.EXPIRATION_PERIOD);
        uint64 requestId = s.getTotalL1RequestNum();
        bytes32 hashedPubData = keccak256(pubData);
        s.l1RequestQueue[requestId] = Request({
            hashedPubData: hashedPubData,
            expirationTime: expirationTime,
            opType: opType
        });
        s.totalL1RequestNum++;
        emit L1Request(accountAddr, requestId, opType, pubData, expirationTime);
    }

    /// @notice Add the pending balance of the specified account id and token id
    /// @param s The rollup storage
    /// @param accountId The id of the account
    /// @param tokenId The id of the token
    /// @param l2Amt The amount of the token in L2
    function addPendingBalance(
        RollupStorage.Layout storage s,
        uint32 accountId,
        uint16 tokenId,
        uint128 l2Amt
    ) internal {
        address accountAddr = AccountStorage.layout().getAccountAddr(accountId);
        Utils.notZeroAddr(accountAddr);

        TokenStorage.Layout storage tsl = TokenStorage.layout();
        AssetConfig memory assetConfig = tsl.getAssetConfig(tokenId);
        Utils.notZeroAddr(address(assetConfig.token));

        uint256 l1Amt = l2Amt.toL1Amt(assetConfig.decimals);
        s.addPendingBalance(accountAddr, tokenId, l1Amt);
    }

    /// @notice Add the pending balance of the specified address and token id
    /// @param s The rollup storage
    /// @param addr The address to be added
    /// @param tokenId The token id
    /// @param l1Amt The amount of the token
    function addPendingBalance(RollupStorage.Layout storage s, address addr, uint16 tokenId, uint256 l1Amt) internal {
        bytes22 key = calcPendingBalanceKey(addr, tokenId);
        s.pendingBalances[key] += l1Amt;
    }

    /// @notice Remove the pending balance of the specified address and token id
    /// @param s The rollup storage
    /// @param addr The address to be removed
    /// @param tokenId The token id on layer2
    /// @param amount The amount of the token
    function removePendingBalance(
        RollupStorage.Layout storage s,
        address addr,
        uint16 tokenId,
        uint256 amount
    ) internal {
        bytes22 key = calcPendingBalanceKey(addr, tokenId);
        uint256 pendingBalance = s.getPendingBalances(key);
        if (pendingBalance < amount) revert InsufficientPendingBalances(pendingBalance, amount);
        unchecked {
            s.pendingBalances[key] = pendingBalance - amount;
        }
    }

    /// @notice Internal function to check whether the all non-executed L1 requests are consumed
    /// @param s The rollup storage
    function requireConsumedAllNonExecutedReq(RollupStorage.Layout storage s) internal view {
        uint64 executedL1RequestNum = s.getExecutedL1RequestNum();
        uint64 totalL1RequestNum = s.getTotalL1RequestNum();
        // the last executed L1 req == the total L1 req (end of consume)
        if (executedL1RequestNum != totalL1RequestNum) {
            uint64 lastL1RequestId = totalL1RequestNum - 1;
            // the last L1 req is evacuation (end of consume and someone already evacuated)
            bool isLastL1RequestEvacuation = s.getL1Request(lastL1RequestId).opType == Operations.OpType.EVACUATION;
            if (!isLastL1RequestEvacuation) revert NotConsumedAllL1Requests(executedL1RequestNum, totalL1RequestNum);
        }
    }

    /// @notice Internal function to get the L1 request of the specified id
    /// @param s The rollup storage
    /// @param requestId The id of the specified request
    /// @return request The request of the specified id
    function getL1Request(RollupStorage.Layout storage s, uint64 requestId) internal view returns (Request memory) {
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

    /// @notice Internal function to check whether the request id is greater than or equal to the current request number
    /// @param s The rollup storage
    /// @param requestId The id of the request
    /// @return bool Return true is the request id is greater than the current request number, else return false
    function isRequestIdGtOrEqCurRequestNum(
        RollupStorage.Layout storage s,
        uint64 requestId
    ) internal view returns (bool) {
        uint64 curRequestNum = s.getTotalL1RequestNum();
        return requestId >= curRequestNum;
    }

    /// @notice Internal function to check whether the block hash is equal to the stored block hash
    /// @param s The rollup storage
    /// @param blockNum The block number
    /// @param storedBlock The stored block will be checked
    function requireBlockHashIsEq(
        RollupStorage.Layout storage s,
        uint32 blockNum,
        StoredBlock memory storedBlock
    ) internal view {
        if (s.getStoredBlockHash(blockNum) != keccak256(abi.encode(storedBlock)))
            revert BlockHashIsNotEq(blockNum, storedBlock);
    }

    /// @notice Internal function to check whether the new block timestamp is valid
    /// @param newBlockTimestamp The new block timestamp
    /// @param lastBlockTimestamp The last block timestamp
    function requireValidBlockTimestamp(uint256 newBlockTimestamp, uint256 lastBlockTimestamp) internal view {
        if (newBlockTimestamp < lastBlockTimestamp)
            revert TimestampLtPreviousBlock(newBlockTimestamp, lastBlockTimestamp);
        if (
            // solhint-disable-next-line not-rely-on-time
            newBlockTimestamp < block.timestamp - Config.COMMIT_BLOCK_TIMESTAMP_MAX_TOLERANCE ||
            // solhint-disable-next-line not-rely-on-time
            newBlockTimestamp > block.timestamp + Config.COMMIT_BLOCK_TIMESTAMP_MAX_DEVIATION
            // solhint-disable-next-line not-rely-on-time
        ) revert InvalidBlockTimestamp(newBlockTimestamp, block.timestamp);
    }

    /// @notice Internal function to check whether the register request is in the L1 request queue
    /// @param request The L1 request
    /// @param register The register request
    /// @return bool if the register request is in the L1 request queue
    function isRegisterInL1RequestQueue(
        Request memory request,
        Operations.Register memory register
    ) internal pure returns (bool) {
        requireMatchedOpType(request.opType, Operations.OpType.REGISTER);
        return Operations.isRegisterHashedPubDataMatched(register, request.hashedPubData);
    }

    /// @notice Internal function to check whether the deposit request is in the L1 request queue
    /// @param request The L1 request
    /// @param deposit The deposit request
    /// @return bool if the deposit request is in the L1 request queue
    function isDepositInL1RequestQueue(
        Request memory request,
        Operations.Deposit memory deposit
    ) internal pure returns (bool) {
        requireMatchedOpType(request.opType, Operations.OpType.DEPOSIT);
        return Operations.isDepositHashedPubDataMatched(deposit, request.hashedPubData);
    }

    /// @notice Internal function to check whether the force withdraw request is in the L1 request queue
    /// @param request The L1 request
    /// @param forceWithdraw The force withdraw request
    /// @return bool if the force withdraw request is in the L1 request queue
    function isForceWithdrawInL1RequestQueue(
        Request memory request,
        Operations.ForceWithdraw memory forceWithdraw
    ) internal pure returns (bool) {
        requireMatchedOpType(request.opType, Operations.OpType.FORCE_WITHDRAW);
        return Operations.isForceWithdrawHashedPubDataMatched(forceWithdraw, request.hashedPubData);
    }

    /// @notice Internal function to check whether the evacuation is in the L1 request queue
    /// @param request The L1 request
    /// @param evacuation The evacuation request
    /// @return bool if the evacuation request is in the L1 request queue
    function isEvacuationInL1RequestQueue(
        Request memory request,
        Operations.Evacuation memory evacuation
    ) internal pure returns (bool) {
        requireMatchedOpType(request.opType, Operations.OpType.EVACUATION);
        return Operations.isEvacuationHashedPubDataMatched(evacuation, request.hashedPubData);
    }

    /// @notice Internal function to check whether the roll borrow request is in the L1 request queue
    /// @param request The L1 request
    /// @param rollBorrow The roll borrow request
    /// @return bool if the roll borrow request is in the L1 request queue
    function isRollBorrowInL1RequestQueue(
        Request memory request,
        Operations.RollBorrow memory rollBorrow
    ) internal pure returns (bool) {
        requireMatchedOpType(request.opType, Operations.OpType.ROLL_BORROW_ORDER);
        return Operations.isRollBorrowHashedPubDataMatched(rollBorrow, request.hashedPubData);
    }

    /// @notice Internal function to check whether the force cancel roll borrow request is in the L1 request queue
    /// @param request The L1 request
    /// @param forceCancelRollBorrow The force cancel roll borrow request
    /// @return bool if the force cancel roll borrow request is in the L1 request queue
    function isForceCancelRollBorrowInL1RequestQueue(
        Request memory request,
        Operations.CancelRollBorrow memory forceCancelRollBorrow
    ) internal pure returns (bool) {
        requireMatchedOpType(request.opType, Operations.OpType.FORCE_CANCEL_ROLL_BORROW);
        return Operations.isForceCancelRollBorrowHashedPubDataMatched(forceCancelRollBorrow, request.hashedPubData);
    }

    /// @notice Internal function check if the operation type is matched
    /// @param opType The operation type of the request
    /// @param expectedOpType The expected operation type
    function requireMatchedOpType(Operations.OpType opType, Operations.OpType expectedOpType) internal pure {
        if (opType != expectedOpType) revert OpTypeIsNotMatched(opType, expectedOpType);
    }

    /// @notice Internal function to check whether the new block number is valid
    /// @param newBlockNum The new block number
    /// @param lastBlockNum The last block number
    function requireValidBlockNum(uint32 newBlockNum, uint32 lastBlockNum) internal pure {
        if (newBlockNum != lastBlockNum + 1) revert InvalidBlockNum(newBlockNum, lastBlockNum);
    }

    /// @notice Internal function to check whether the public data length is valid
    /// @dev The public data length should be multiple of chunk size
    /// @dev The numbers of chunk should be multiple of 8
    /// @param pubDataLength The public data length
    function requireValidPubDataLength(uint256 pubDataLength) internal pure {
        // Two assertions below are equivalent to the assertion below
        // assert(publicDataLength % Config.BYTES_OF_CHUNK == 0) &&
        // assert((publicDataLength / Config.BYTES_OF_CHUNK) % BITS_OF_BYTES == 0)
        // ==> assert(publicDataLength % (Config.BYTES_OF_CHUNK * BITS_OF_BYTES) == 0)
        // ==> assert(publicDataLength % Config.BITS_OF_CHUNK == 0)
        if (pubDataLength % Config.BITS_OF_CHUNK != 0) revert InvalidPubDataLength(pubDataLength);
    }

    /// @notice Internal function to calculate the pending balance key
    /// @param addr The user address
    /// @param tokenId The token id
    /// @return pendingBalanceKey The key of pending balance
    function calcPendingBalanceKey(address addr, uint16 tokenId) internal pure returns (bytes22) {
        return bytes22((uint176(uint160(addr)) | (uint176(tokenId) << 160)));
    }

    /// @notice Internal function calculate the commitment of the new block
    /// @dev    newTsRoot is packed in commitment for data availablity and will be proved in the circuit
    /// @param previousBlock The previous block
    /// @param newBlock The new block to be committed
    /// @param commitmentOffset The offset of the commitment
    /// @return commitment The commitment of the new block
    function calcBlockCommitment(
        StoredBlock memory previousBlock,
        CommitBlock calldata newBlock,
        bytes memory commitmentOffset
    ) internal pure returns (bytes32) {
        return
            sha256(
                abi.encodePacked(
                    previousBlock.stateRoot,
                    newBlock.newStateRoot,
                    newBlock.newTsRoot,
                    newBlock.timestamp,
                    commitmentOffset,
                    newBlock.publicData
                )
            );
    }
}
