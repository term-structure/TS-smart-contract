// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {SafeCast} from "@solidstate/contracts/utils/SafeCast.sol";
import {RollupStorage, Proof, StoredBlock, CommitBlock, ExecuteBlock, VerifyBlock, Request} from "./RollupStorage.sol";
import {AccountStorage} from "../account/AccountStorage.sol";
import {AddressStorage} from "../address/AddressStorage.sol";
import {LoanStorage, Loan} from "../loan/LoanStorage.sol";
import {ProtocolParamsStorage, FundWeight} from "../protocolParams/ProtocolParamsStorage.sol";
import {RollupStorage} from "./RollupStorage.sol";
import {TokenStorage} from "../token/TokenStorage.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {IRollupFacet} from "./IRollupFacet.sol";
import {RollupLib} from "./RollupLib.sol";
import {ProtocolParamsLib} from "../protocolParams/ProtocolParamsLib.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {LoanLib} from "../loan/LoanLib.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {IVerifier} from "../interfaces/IVerifier.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {Operations} from "../libraries/Operations.sol";
import {Bytes} from "../libraries/Bytes.sol";
import {Config} from "../libraries/Config.sol";
import {Utils} from "../libraries/Utils.sol";

/**
 * @title Term Structure Rollup Facet Contract
 * @author Term Structure Labs
 * @notice The RollupFacet contract is used to manage the functions abount zk-rollup
 */
contract RollupFacet is IRollupFacet, AccessControlInternal, ReentrancyGuard {
    using AccountLib for AccountStorage.Layout;
    using AddressLib for AddressStorage.Layout;
    using ProtocolParamsLib for ProtocolParamsStorage.Layout;
    using TokenLib for TokenStorage.Layout;
    using Bytes for bytes;
    using Operations for bytes;
    using RollupLib for *;
    using LoanLib for *;
    using Utils for *;
    using Math for *;

    /* ============ External Functions ============ */

    /**
     * @inheritdoc IRollupFacet
     */
    function commitBlocks(
        StoredBlock memory lastCommittedBlock,
        CommitBlock[] calldata newBlocks
    ) external onlyRole(Config.COMMITTER_ROLE) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireActive();

        _commitBlocks(rsl, lastCommittedBlock, newBlocks, _processOneRequest);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function verifyBlocks(VerifyBlock[] calldata verifyingBlocks) external onlyRole(Config.VERIFIER_ROLE) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireActive();

        _verifyBlocks(rsl, verifyingBlocks);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function executeBlocks(ExecuteBlock[] calldata pendingBlocks) external onlyRole(Config.EXECUTER_ROLE) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireActive();

        _executeBlocks(rsl, pendingBlocks);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function revertBlocks(StoredBlock[] calldata revertedBlocks) external onlyRole(Config.COMMITTER_ROLE) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireActive();

        uint32 committedBlockNum = rsl.getCommittedBlockNum();
        uint32 executedBlockNum = rsl.getExecutedBlockNum();
        uint32 pendingBlockNum = committedBlockNum - executedBlockNum;
        uint32 revertBlockNum = uint32(revertedBlocks.length) < pendingBlockNum
            ? uint32(revertedBlocks.length)
            : pendingBlockNum;
        uint64 revertedL1RequestNum;

        for (uint32 i; i < revertBlockNum; ++i) {
            StoredBlock memory revertedBlock = revertedBlocks[i];
            rsl.requireBlockHashIsEq(committedBlockNum, revertedBlock);

            delete rsl.storedBlockHashes[committedBlockNum];
            --committedBlockNum;
            revertedL1RequestNum += revertedBlock.l1RequestNum;
        }

        rsl.committedBlockNum = committedBlockNum;
        rsl.committedL1RequestNum -= revertedL1RequestNum;
        if (committedBlockNum < rsl.getVerifiedBlockNum()) rsl.verifiedBlockNum = committedBlockNum;
        emit BlockRevert(committedBlockNum);
    }

    /**
     * @inheritdoc IRollupFacet
     * @notice The evacuation mode will be activated when the current block timestamp
     *      is greater than the expiration block timestamp of the last executed L1 request
     * @notice When the evacuation mode is activated, the block state will be rolled back to the last executed block
     *      and the request state will be rolled back to the last executed request
     * @notice The remaining non-executed L1 requests will be consumed by the consumeL1RequestInEvacuMode function
     *      with their public data, after consume all non-executed request, user can start to evacuate their funds
     */
    function activateEvacuation() external {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireActive();

        uint64 executedL1RequestNum = rsl.getExecutedL1RequestNum();
        uint64 lastExecutedL1RequestId = executedL1RequestNum - 1;
        uint32 expirationTime = rsl.getL1Request(lastExecutedL1RequestId).expirationTime;
        // solhint-disable-next-line not-rely-on-time
        if (block.timestamp > expirationTime && expirationTime != 0) {
            /// Roll back state
            uint32 executedBlockNum = rsl.getExecutedBlockNum();
            rsl.committedBlockNum = executedBlockNum;
            rsl.verifiedBlockNum = executedBlockNum;
            rsl.committedL1RequestNum = executedL1RequestNum;
            rsl.evacuMode = true;
            emit EvacuModeActivation();
        } else {
            // solhint-disable-next-line not-rely-on-time
            revert TimeStampIsNotExpired(block.timestamp, expirationTime);
        }
    }

    /**
     * @inheritdoc IRollupFacet
     * @notice The function only can be called in evacuation mode
     * @notice Consume the non-executed L1 requests with their public data
     */
    function consumeL1RequestInEvacuMode(bytes[] calldata consumedTxPubData) external {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireEvacuMode();

        uint64 totalL1RequestNum = rsl.getTotalL1RequestNum();
        uint64 lastL1RequestId = totalL1RequestNum - 1;
        ///  the last L1 request cannot be evacuation because it would means all L1 requests have been consumed and start to evacuate
        if (rsl.getL1Request(lastL1RequestId).opType == Operations.OpType.EVACUATION)
            revert LastL1RequestIsEvacuation(totalL1RequestNum);

        uint64 executedL1RequestNum = rsl.getExecutedL1RequestNum();
        if (executedL1RequestNum + consumedTxPubData.length > totalL1RequestNum)
            revert ConsumedRequestNumExceedTotalNum(consumedTxPubData.length);

        bytes memory pubData;
        for (uint32 i; i < consumedTxPubData.length; ++i) {
            pubData = consumedTxPubData[i];
            Request memory request = rsl.getL1Request(executedL1RequestNum);
            bytes32 hashedPubData = keccak256(pubData);
            if (request.hashedPubData != hashedPubData) revert InvalidConsumedPubData(executedL1RequestNum, pubData);

            Operations.OpType opType = Operations.OpType(uint8(pubData[0]));
            if (opType > type(Operations.OpType).max) revert InvalidOpType(opType);

            if (opType == Operations.OpType.DEPOSIT) {
                /// refund the deposit amount to the pending balance for withdraw
                Operations.Deposit memory depositReq = pubData.readDepositPubData();
                _addPendingBalance(rsl, depositReq.accountId, depositReq.tokenId, depositReq.amount);
            } else if (opType == Operations.OpType.REGISTER) {
                /// de-register only remove the accountAddr mapping to accountId,
                /// which use to check in AccountLib.getValidAccount and let user can register again
                /// and still can add pending balance to this register account
                /// when consume the deposit request in the next request
                Operations.Register memory registerReq = pubData.readRegisterPubData();
                AccountStorage.Layout storage asl = AccountStorage.layout();
                address registerAddr = asl.accountAddresses[registerReq.accountId];
                delete asl.accountIds[registerAddr];
                // solhint-disable-next-line no-empty-blocks
            } else {
                // do nothing, others L1 requests have no storage changes
            }
            ++executedL1RequestNum;
            emit L1RequestConsumed(executedL1RequestNum, opType, pubData);
        }
        rsl.committedL1RequestNum = executedL1RequestNum;
        rsl.executedL1RequestNum = executedL1RequestNum;
    }

    /**
     * @inheritdoc IRollupFacet
     * @notice The function only can be called in evacuation mode and after consume all non-executed L1 requests
     * @notice The newBlock is a pseudo block, it only for create the block commitment and not commit to the state
     * @notice The evacuate fuction will not commit a new state root to make all the users evacuate their funds from the same state
     */
    function evacuate(
        StoredBlock calldata lastExecutedBlock,
        CommitBlock calldata newBlock,
        Proof calldata proof
    ) external nonReentrant {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireEvacuMode();

        _requireConsumedAllNonExecutedReq(rsl);

        rsl.requireBlockHashIsEq(rsl.getExecutedBlockNum(), lastExecutedBlock);
        newBlock.blockNumber.requireValidBlockNum(lastExecutedBlock.blockNumber);
        newBlock.timestamp.requireValidBlockTimestamp(lastExecutedBlock.timestamp);

        bytes calldata publicData = newBlock.publicData;
        // evacuation public data length is 2 chunks
        if (publicData.length != Config.BYTES_OF_TWO_CHUNKS) revert InvalidEvacuatePubDataLength(publicData.length);

        bytes32 commitment = _calcBlockCommitment(lastExecutedBlock, newBlock, Config.EVACUATION_COMMITMENT_OFFSET);

        _verifyOneBlock(commitment, proof, AddressStorage.layout().getEvacuVerifier());

        Operations.Evacuation memory evacuation = Operations.readEvacuationPubdata(publicData);
        _evacuate(rsl, evacuation);
    }

    /**
     * @inheritdoc IRollupFacet
     * @dev The function only can be called in evacuation mode and after consume all non-executed L1 requests
     * @dev The commitEvacuBlocks only can including evacuation requests in each block
     */
    function commitEvacuBlocks(
        StoredBlock memory lastCommittedBlock,
        CommitBlock[] calldata evacuBlocks
    ) external onlyRole(Config.COMMITTER_ROLE) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireEvacuMode();

        _requireConsumedAllNonExecutedReq(rsl);
        _commitBlocks(rsl, lastCommittedBlock, evacuBlocks, _processOneEvacuRequest);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function verifyEvacuBlocks(VerifyBlock[] calldata evacuBlocks) external onlyRole(Config.VERIFIER_ROLE) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireEvacuMode();

        _requireConsumedAllNonExecutedReq(rsl);
        _verifyBlocks(rsl, evacuBlocks);
    }

    /**
     * @inheritdoc IRollupFacet
     * @dev If executed all evacuation requests, the protocol will exit the evacuation mode and back to normal mode
     */
    function executeEvacuBlocks(ExecuteBlock[] calldata evacuBlocks) external onlyRole(Config.EXECUTER_ROLE) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireEvacuMode();

        _requireConsumedAllNonExecutedReq(rsl);
        _executeBlocks(rsl, evacuBlocks);

        /// If executed L1 requests number == total L1 requests number
        /// means all evacuation requests have been executed,
        /// the protocol will exit the evacuation mode and back to normal mode
        if (rsl.getExecutedL1RequestNum() == rsl.getTotalL1RequestNum()) {
            rsl.evacuMode = false;
            emit EvacuModeDeactivation();
        }
    }

    /* ============ External View Functions ============ */

    /**
     * @inheritdoc IRollupFacet
     */
    function isEvacuMode() external view returns (bool) {
        return RollupStorage.layout().isEvacuMode();
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function isEvacuted(address addr, uint16 tokenId) external view returns (bool) {
        uint32 accountId = AccountStorage.layout().getAccountId(addr);
        return RollupStorage.layout().isEvacuated(accountId, tokenId);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function isRegisterInL1RequestQueue(
        Operations.Register memory register,
        uint64 requestId
    ) external view returns (bool) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        if (rsl.isRequestIdGtOrEqCurRequestNum(requestId)) return false;
        Request memory request = rsl.getL1Request(requestId);
        return request.isRegisterInL1RequestQueue(register);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function isDepositInL1RequestQueue(
        Operations.Deposit memory deposit,
        uint64 requestId
    ) external view returns (bool) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        if (rsl.isRequestIdGtOrEqCurRequestNum(requestId)) return false;
        Request memory request = rsl.getL1Request(requestId);
        return request.isDepositInL1RequestQueue(deposit);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function isForceWithdrawInL1RequestQueue(
        Operations.ForceWithdraw memory forceWithdraw,
        uint64 requestId
    ) external view returns (bool) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        if (rsl.isRequestIdGtOrEqCurRequestNum(requestId)) return false;
        Request memory request = rsl.getL1Request(requestId);
        return request.isForceWithdrawInL1RequestQueue(forceWithdraw);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function isEvacuationInL1RequestQueue(
        Operations.Evacuation memory evacuation,
        uint64 requestId
    ) external view returns (bool) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        if (rsl.isRequestIdGtOrEqCurRequestNum(requestId)) return false;
        Request memory request = rsl.getL1Request(requestId);
        return request.isEvacuationInL1RequestQueue(evacuation);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getL1Request(uint64 requestId) external view returns (Request memory) {
        return RollupStorage.layout().getL1Request(requestId);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getL1RequestNum() external view returns (uint64, uint64, uint64) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        return (rsl.getCommittedL1RequestNum(), rsl.getExecutedL1RequestNum(), rsl.getTotalL1RequestNum());
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getBlockNum() external view returns (uint32, uint32, uint32) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        return (rsl.getCommittedBlockNum(), rsl.getVerifiedBlockNum(), rsl.getExecutedBlockNum());
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getStoredBlockHash(uint32 blockNum) external view returns (bytes32) {
        return RollupStorage.layout().getStoredBlockHash(blockNum);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getPendingBalances(address accountAddr, IERC20 token) external view returns (uint256) {
        uint16 tokenId = TokenStorage.layout().getTokenId(token);
        bytes22 key = RollupLib.calcPendingBalanceKey(accountAddr, tokenId);
        return RollupStorage.layout().getPendingBalances(key);
    }

    /* ============ Internal Functions ============ */

    /// @notice Internal function to commit blocks
    /// @param rsl RollupStorage Layout
    /// @param lastCommittedBlock Last committed block
    /// @param newBlocks New blocks to commit
    /// @param processRequestFunc The process request function
    ///        if the block is normal block, the function is _processOneRequest
    ///        if the block is evacuation block, the function is _processOneEvacuRequest
    function _commitBlocks(
        RollupStorage.Layout storage rsl,
        StoredBlock memory lastCommittedBlock,
        CommitBlock[] calldata newBlocks,
        function(RollupStorage.Layout storage, bytes calldata, uint256, uint64, bytes32)
            internal
            view
            returns (uint64, bytes32) processRequestFunc
    ) internal {
        rsl.requireBlockHashIsEq(rsl.getCommittedBlockNum(), lastCommittedBlock);

        uint64 committedL1RequestNum = rsl.getCommittedL1RequestNum();
        for (uint32 i; i < newBlocks.length; ++i) {
            CommitBlock calldata newBlock = newBlocks[i];

            /// if evacuation blocks, check the block only includes the evacuation request and noop
            if (processRequestFunc == _processOneEvacuRequest) {
                _requireValidEvacuBlockChunkIdDelta(newBlock.chunkIdDeltas);
                _requireValidEvacuBlockPubData(newBlock.chunkIdDeltas.length, newBlock.publicData);
            }

            lastCommittedBlock = _commitOneBlock(
                rsl,
                lastCommittedBlock,
                newBlock,
                committedL1RequestNum,
                processRequestFunc
            );

            committedL1RequestNum += lastCommittedBlock.l1RequestNum;
            rsl.storedBlockHashes[lastCommittedBlock.blockNumber] = keccak256(abi.encode(lastCommittedBlock));
            emit BlockCommit(lastCommittedBlock.blockNumber, lastCommittedBlock.commitment);
        }

        if (committedL1RequestNum > rsl.getTotalL1RequestNum())
            revert CommittedRequestNumExceedTotalNum(committedL1RequestNum);

        rsl.committedL1RequestNum = committedL1RequestNum;
        rsl.committedBlockNum += uint32(newBlocks.length);
    }

    /// @notice Internal function to commit one block
    /// @param rsl Rollup storage layout
    /// @param previousBlock The previous block
    /// @param newBlock The new block to be committed
    /// @param committedL1RequestNum The committed L1 request number
    /// @param processRequestFunc The process request function
    ///        if the block is normal block, the function is _processOneRequest
    ///        if the block is evacuation block, the function is _processOneEvacuRequest
    /// @return storedBlock The committed block
    function _commitOneBlock(
        RollupStorage.Layout storage rsl,
        StoredBlock memory previousBlock,
        CommitBlock calldata newBlock,
        uint64 committedL1RequestNum,
        function(RollupStorage.Layout storage, bytes calldata, uint256, uint64, bytes32)
            internal
            view
            returns (uint64, bytes32) processRequestFunc
    ) internal view returns (StoredBlock memory) {
        newBlock.blockNumber.requireValidBlockNum(previousBlock.blockNumber);
        newBlock.timestamp.requireValidBlockTimestamp(previousBlock.timestamp);
        newBlock.publicData.length.requireValidPubDataLength();

        /// The commitment offset array is used to store the commitment offset for each chunk
        bytes memory commitmentOffset = new bytes(newBlock.publicData.length / Config.BITS_OF_CHUNK);
        uint256 chunkId;
        uint64 requestId = committedL1RequestNum;
        bytes32 processableRollupTxHash = Config.EMPTY_STRING_KECCAK;
        uint256 chunkIdDeltaLength = newBlock.chunkIdDeltas.length;
        for (uint256 i; i < chunkIdDeltaLength; ++i) {
            chunkId += newBlock.chunkIdDeltas[i];
            uint256 offset = chunkId * Config.BYTES_OF_CHUNK;
            if (offset >= newBlock.publicData.length) revert OffsetGtPubDataLength(offset);

            (requestId, processableRollupTxHash) = processRequestFunc(
                rsl,
                newBlock.publicData,
                offset,
                requestId,
                processableRollupTxHash
            );

            commitmentOffset = _updateCommitmentOffsetForChunk(commitmentOffset, chunkId);
        }

        uint64 processedL1RequestNum = requestId - committedL1RequestNum;
        bytes32 commitment = _calcBlockCommitment(previousBlock, newBlock, commitmentOffset);
        return
            StoredBlock({
                blockNumber: newBlock.blockNumber,
                l1RequestNum: processedL1RequestNum,
                pendingRollupTxHash: processableRollupTxHash,
                commitment: commitment,
                stateRoot: newBlock.newStateRoot,
                timestamp: newBlock.timestamp
            });
    }

    /// @notice Internal function to check whether the chunk id delta is valid when commit evacuation block
    /// @dev The evacuation block only includes the evacuation request or noop,
    ///      so the first chunk id delta should be 0 and the remaining chunk id delta should be evacuation chunk size
    /// @param chunkIdDeltas The chunk id delta array
    function _requireValidEvacuBlockChunkIdDelta(uint16[] calldata chunkIdDeltas) internal pure {
        uint256 chunkIdDeltaLength = chunkIdDeltas.length;
        if (chunkIdDeltaLength != 0 && chunkIdDeltas[0] != 0) revert InvalidChunkIdDelta(chunkIdDeltas);
        // for (uint256 i = 1; i < chunkIdDeltaLength; ++i) {
        //     if (chunkIdDeltas[i] != Config.EVACUATION_CHUNK_SIZE) revert InvalidChunkIdDelta(chunkIdDeltas);
        // }
        uint256 andDeltas = Config.EVACUATION_CHUNK_SIZE;
        uint256 orDeltas = Config.EVACUATION_CHUNK_SIZE;
        for (uint256 i = 1; i < chunkIdDeltaLength; ++i) {
            andDeltas &= chunkIdDeltas[i];
            orDeltas |= chunkIdDeltas[i];
        }
        if (andDeltas != orDeltas) revert InvalidChunkIdDelta(chunkIdDeltas);
    }

    /// @notice Internal function to check whether the evacuation block pubdata is valid
    /// @dev The evacuation block only includes the evacuation request,
    ///      so the pubdata length should be evacuation request number * evacuation chunk size
    ///      and remaining pubdata should be padded with 0 bytes and have no other values
    /// @param evacuationRequestNum The number of evacuation requests
    /// @param pubData The public data of the block
    function _requireValidEvacuBlockPubData(uint256 evacuationRequestNum, bytes calldata pubData) internal pure {
        uint256 validBytesNum = evacuationRequestNum * Config.BYTES_OF_TWO_CHUNKS; // evacuation request is 2 chunks
        if (pubData.length < validBytesNum) revert InvalidEvacuBlockPubData(evacuationRequestNum);
        bytes4 errorSelector = InvalidEvacuBlockPubData.selector;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            let data
            // check each 32 bytes in zero length
            let zeroLen := sub(pubData.length, validBytesNum)
            let curr := add(pubData.offset, validBytesNum)
            let end := add(curr, mul(div(zeroLen, 0x20), 0x20))
            // solhint-disable-next-line no-empty-blocks
            for {

            } lt(curr, end) {
                curr := add(curr, 0x20)
            } {
                data := or(data, calldataload(curr))
            }

            // check remainders bytes in zero length
            let r := mod(zeroLen, 0x20)
            // shift right (0x20 - r) bytes to remove the garbage data
            let endData := shr(mul(sub(0x20, r), 0x8), calldataload(end))
            data := or(data, endData)

            // if data is not zero, revert
            if data {
                let ptr := mload(0x40)
                mstore(ptr, errorSelector)
                mstore(add(ptr, 0x04), evacuationRequestNum)
                revert(ptr, 0x24)
            }
        }
    }

    /// @notice Internal function to check whether the all non-executed L1 requests are consumed
    /// @param rsl Rollup storage layout
    function _requireConsumedAllNonExecutedReq(RollupStorage.Layout storage rsl) internal view {
        uint64 executedL1RequestNum = rsl.getExecutedL1RequestNum();
        uint64 totalL1RequestNum = rsl.getTotalL1RequestNum();
        uint64 lastL1RequestId = totalL1RequestNum - 1;
        /// the last executed L1 req == the total L1 req (end of consume),
        /// the last L1 req is evacuation (end of consume and someone already evacuated)
        bool isExecutedL1RequestNumEqTotalL1RequestNum = executedL1RequestNum == totalL1RequestNum;
        bool isLastL1RequestEvacuation = rsl.getL1Request(lastL1RequestId).opType == Operations.OpType.EVACUATION;
        if (!isExecutedL1RequestNumEqTotalL1RequestNum && !isLastL1RequestEvacuation)
            revert NotConsumedAllL1Requests(executedL1RequestNum, totalL1RequestNum);
    }

    /// @notice Internal function to update the commitment offset for the chunk
    /// @param commitmentOffset The commitment offset
    /// @param chunkId The chunk id
    /// @return newCommitmentOffset The updated commitment offset
    function _updateCommitmentOffsetForChunk(
        bytes memory commitmentOffset,
        uint256 chunkId
    ) internal pure returns (bytes memory) {
        // calc the chunk group index
        uint256 chunkGroupIdx = chunkId / Config.BITS_OF_BYTE;

        // get the processing commitment offset by chunk group index
        uint8 processingCommitmentOffset = uint8(commitmentOffset[chunkGroupIdx]);

        // calc the bitwise mask for target chunk id
        // (chunkId % Config.BITS_OF_BYTE): which bit in the group
        // LAST_INDEX_OF_BYTE - (chunkId % Config.BITS_OF_BYTE): big endian to little endian
        uint8 bitwiseMask = uint8(1 << (Config.LAST_INDEX_OF_BYTE - (chunkId % Config.BITS_OF_BYTE)));
        if (processingCommitmentOffset & bitwiseMask != 0) revert OffsetIsSet(chunkId);

        // set commitment offset to 1 for target chunk id
        commitmentOffset[chunkGroupIdx] = bytes1(processingCommitmentOffset | bitwiseMask);
        return commitmentOffset;
    }

    /// @notice Process one request
    /// @param rsl The rollup storage layout
    /// @param pubData The public data of the new block
    /// @param offset The offset of the public data
    /// @param requestId The request id of the new block
    /// @param processableRollupTxHash The processable rollup tx hash
    /// @return newRequestId The new L1 request id
    /// @dev newRequestId is used to increase the L1 request id if the processed request is L1 request
    /// @return newProcessableRollupTxHash The new processable rollup tx hash
    /// @dev newProcessableRollupTxHash will be updated if the processed request is to be executed
    function _processOneRequest(
        RollupStorage.Layout storage rsl,
        bytes calldata pubData,
        uint256 offset,
        uint64 requestId,
        bytes32 processableRollupTxHash
    ) internal view returns (uint64, bytes32) {
        bytes memory data;
        bool isL1Request;
        bool isToBeExecuted;
        Operations.OpType opType = Operations.OpType(uint8(pubData[offset]));

        // non L1 request
        if (opType == Operations.OpType.WITHDRAW) {
            data = pubData.sliceThreeChunksBytes(offset); // 3 chunks
            isToBeExecuted = true;
        } else if (opType == Operations.OpType.AUCTION_END) {
            data = pubData.sliceFourChunksBytes(offset); // 4 chunks
            isToBeExecuted = true;
        } else if (opType == Operations.OpType.WITHDRAW_FEE) {
            data = pubData.sliceTwoChunksBytes(offset); // 2 chunks
            isToBeExecuted = true;
        } else if (opType == Operations.OpType.CREATE_TSB_TOKEN) {
            data = pubData.sliceOneChunkBytes(offset); // 1 chunk
            Operations.CreateTsbToken memory createTsbTokenReq = data.readCreateTsbTokenPubData();
            TokenStorage.Layout storage tsl = TokenStorage.layout();
            AssetConfig memory tokenConfig = tsl.getAssetConfig(createTsbTokenReq.tsbTokenId);
            (IERC20 underlyingAsset, uint32 maturityTime) = ITsbToken(address(tokenConfig.token)).tokenInfo();
            if (maturityTime != createTsbTokenReq.maturityTime)
                revert MaturityTimeIsNotMatched(maturityTime, createTsbTokenReq.maturityTime);

            tokenConfig = tsl.getAssetConfig(createTsbTokenReq.baseTokenId);
            if (underlyingAsset != tokenConfig.token) revert TokenIsNotMatched(underlyingAsset, tokenConfig.token);
        } else {
            // L1 request
            isL1Request = true;
            Request memory request = rsl.getL1Request(requestId);
            if (opType == Operations.OpType.REGISTER) {
                data = pubData.sliceThreeChunksBytes(offset); // 3 chunks
                Operations.Register memory register = data.readRegisterPubData();
                request.isRegisterInL1RequestQueue(register);
            } else if (opType == Operations.OpType.DEPOSIT) {
                data = pubData.sliceTwoChunksBytes(offset); // 2 chunks
                Operations.Deposit memory deposit = data.readDepositPubData();
                request.isDepositInL1RequestQueue(deposit);
            } else if (opType == Operations.OpType.FORCE_WITHDRAW) {
                data = pubData.sliceTwoChunksBytes(offset); // 2 chunks
                Operations.ForceWithdraw memory forceWithdrawReq = data.readForceWithdrawPubData();
                request.isForceWithdrawInL1RequestQueue(forceWithdrawReq);
                isToBeExecuted = true;
            } else {
                revert InvalidOpType(opType);
            }
        }
        // If processed request is L1 request, increase the L1 request id
        if (isL1Request) ++requestId;
        // If processed request is to be executed, update the processable rollup tx hash for executing the request when executeBlock
        if (isToBeExecuted) processableRollupTxHash = keccak256(abi.encode(processableRollupTxHash, data));

        return (requestId, processableRollupTxHash);
    }

    /// @notice Process one evacuation request
    /// @param rsl The rollup storage layout
    /// @param pubData The public data of the new block
    /// @param offset The offset of the public data
    /// @param requestId The request id of the new block
    /// @param processableRollupTxHash The processable rollup tx hash
    /// @return newRequestId The new L1 request id
    /// @return newProcessableRollupTxHash The new processable rollup tx hash
    function _processOneEvacuRequest(
        RollupStorage.Layout storage rsl,
        bytes calldata pubData,
        uint256 offset,
        uint64 requestId,
        bytes32 processableRollupTxHash
    ) internal view returns (uint64, bytes32) {
        Operations.OpType opType = Operations.OpType(uint8(pubData[offset]));
        if (opType != Operations.OpType.EVACUATION) revert InvalidOpType(opType);

        bytes memory data = pubData.sliceTwoChunksBytes(offset); // 2 chunks
        Operations.Evacuation memory evacuation = data.readEvacuationPubdata();
        rsl.getL1Request(requestId).isEvacuationInL1RequestQueue(evacuation);
        processableRollupTxHash = keccak256(abi.encode(processableRollupTxHash, data));

        return (++requestId, processableRollupTxHash);
    }

    /// @notice Internal function to verify blocks
    /// @param rsl The rollup storage layout
    /// @param verifyingBlocks The verifying blocks
    function _verifyBlocks(RollupStorage.Layout storage rsl, VerifyBlock[] calldata verifyingBlocks) internal {
        uint32 verifiedBlockNum = rsl.getVerifiedBlockNum();
        uint256 verifyingBlocksLength = verifyingBlocks.length;
        if (verifiedBlockNum + verifyingBlocksLength > rsl.getCommittedBlockNum())
            revert VerifiedBlockNumExceedCommittedNum(verifyingBlocksLength);

        for (uint256 i; i < verifyingBlocksLength; ++i) {
            ++verifiedBlockNum;
            VerifyBlock calldata verifyingBlock = verifyingBlocks[i];
            rsl.requireBlockHashIsEq(verifiedBlockNum, verifyingBlock.storedBlock);

            _verifyOneBlock(
                verifyingBlock.storedBlock.commitment,
                verifyingBlock.proof,
                AddressStorage.layout().getVerifier()
            );
            emit BlockVerification(verifyingBlock.storedBlock.blockNumber);
        }
        rsl.verifiedBlockNum = verifiedBlockNum;
    }

    /// @notice Internal function to verify one block
    /// @param commitment The commitment of the block
    /// @param proof The proof of the block
    /// @param verifier The verifier contract
    ///        if the block is normal block, use the AddressStorage.verifier (for normal circuit)
    ///        if the block is evacuation block, use the AddressStorage.evacuVerifier (for evacuation circuit)
    function _verifyOneBlock(bytes32 commitment, Proof calldata proof, IVerifier verifier) internal view {
        if (proof.commitment[0] != uint256(commitment) % Config.SCALAR_FIELD_SIZE)
            revert CommitmentInconsistant(proof.commitment[0], uint256(commitment));

        if (!verifier.verifyProof(proof.a, proof.b, proof.c, proof.commitment)) revert InvalidProof(proof);
    }

    /// @notice Internal function to execute blocks
    /// @param rsl The rollup storage layout
    /// @param pendingBlocks The pending blocks
    function _executeBlocks(RollupStorage.Layout storage rsl, ExecuteBlock[] calldata pendingBlocks) internal {
        uint32 executedBlockNum = rsl.getExecutedBlockNum();
        uint256 pendingBlocksLength = pendingBlocks.length;
        if (executedBlockNum + pendingBlocksLength > rsl.getVerifiedBlockNum())
            revert ExecutedBlockNumExceedProvedNum(pendingBlocksLength);

        uint64 executedL1RequestNum = rsl.getExecutedL1RequestNum();
        for (uint32 i; i < pendingBlocksLength; ++i) {
            ExecuteBlock calldata pendingBlock = pendingBlocks[i];
            rsl.requireBlockHashIsEq(pendingBlock.storedBlock.blockNumber, pendingBlock.storedBlock);

            ++executedBlockNum;
            if (pendingBlock.storedBlock.blockNumber != executedBlockNum)
                revert InvalidExecutedBlockNum(pendingBlock.storedBlock.blockNumber);

            _executeOneBlock(rsl, pendingBlock);

            executedL1RequestNum += pendingBlock.storedBlock.l1RequestNum;
            emit BlockExecution(pendingBlock.storedBlock.blockNumber);
        }
        rsl.executedBlockNum = executedBlockNum;
        rsl.executedL1RequestNum = executedL1RequestNum;
    }

    /// @notice Internal function to execute one block
    /// @param rsl The rollup storage layout
    /// @param executeBlock The block to be executed
    function _executeOneBlock(RollupStorage.Layout storage rsl, ExecuteBlock calldata executeBlock) internal {
        bytes32 pendingRollupTxHash = Config.EMPTY_STRING_KECCAK;
        bytes memory pubData;
        for (uint32 i; i < executeBlock.pendingRollupTxPubData.length; ++i) {
            pubData = executeBlock.pendingRollupTxPubData[i];
            Operations.OpType opType = Operations.OpType(uint8(pubData[0]));
            if (opType == Operations.OpType.WITHDRAW) {
                Operations.Withdraw memory withdrawReq = pubData.readWithdrawPubData();
                _addPendingBalance(rsl, withdrawReq.accountId, withdrawReq.tokenId, withdrawReq.amount);
            } else if (opType == Operations.OpType.FORCE_WITHDRAW) {
                Operations.ForceWithdraw memory forceWithdrawReq = pubData.readForceWithdrawPubData();
                _addPendingBalance(rsl, forceWithdrawReq.accountId, forceWithdrawReq.tokenId, forceWithdrawReq.amount);
            } else if (opType == Operations.OpType.AUCTION_END) {
                Operations.AuctionEnd memory auctionEnd = pubData.readAuctionEndPubData();
                _updateLoan(auctionEnd);
            } else if (opType == Operations.OpType.WITHDRAW_FEE) {
                Operations.WithdrawFee memory withdrawFee = pubData.readWithdrawFeePubdata();
                _withdrawFee(rsl, withdrawFee);
            } else if (opType == Operations.OpType.EVACUATION) {
                Operations.Evacuation memory evacuation = pubData.readEvacuationPubdata();
                rsl.evacuated[evacuation.accountId][evacuation.tokenId] = false;
            } else {
                revert InvalidOpType(opType);
            }
            pendingRollupTxHash = keccak256(abi.encode(pendingRollupTxHash, pubData));
        }

        if (pendingRollupTxHash != executeBlock.storedBlock.pendingRollupTxHash)
            revert PendingRollupTxHashIsNotMatched(pendingRollupTxHash, executeBlock.storedBlock.pendingRollupTxHash);
    }

    /// @notice Internal function to add the pending balance of an account
    /// @param rsl The rollup storage
    /// @param accountId The id of the account
    /// @param tokenId The id of the token
    /// @param l2Amt The amount of the token in L2
    function _addPendingBalance(
        RollupStorage.Layout storage rsl,
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
        rsl.addPendingBalance(accountAddr, tokenId, l1Amt);
    }

    /// @notice Internal function to update the onchain loan info
    /// @param auctionEnd The auction end request
    function _updateLoan(Operations.AuctionEnd memory auctionEnd) internal {
        uint32 accountId = auctionEnd.accountId;
        address accountAddr = AccountStorage.layout().getAccountAddr(accountId);
        Utils.notZeroAddr(accountAddr);

        TokenStorage.Layout storage tsl = TokenStorage.layout();
        // tsbToken config
        AssetConfig memory assetConfig = tsl.getAssetConfig(auctionEnd.tsbTokenId);
        address tokenAddr = address(assetConfig.token);
        Utils.notZeroAddr(tokenAddr);
        ITsbToken tsbToken = ITsbToken(tokenAddr);
        if (!assetConfig.isTsbToken) revert InvalidTsbTokenAddr(tokenAddr);

        (bytes12 loanId, Loan memory newLoan) = _getAuctionInfo(tsl, auctionEnd, tsbToken);

        // update loan
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        Loan memory loan = lsl.getLoan(loanId);
        loan = loan.updateLoan(newLoan.collateralAmt, newLoan.debtAmt);
        lsl.loans[loanId] = loan;

        emit UpdateLoan(loanId, accountId, newLoan.collateralAmt, newLoan.debtAmt);
    }

    /// @notice Internal function to get the auction info
    /// @param tsl The token storage
    /// @param auctionEnd The auction end request
    /// @param tsbToken The tsbToken
    function _getAuctionInfo(
        TokenStorage.Layout storage tsl,
        Operations.AuctionEnd memory auctionEnd,
        ITsbToken tsbToken
    ) internal view virtual returns (bytes12, Loan memory) {
        // collateral token config
        uint16 collateralTokenId = auctionEnd.collateralTokenId;
        AssetConfig memory assetConfig = tsl.getAssetConfig(collateralTokenId);
        Utils.notZeroAddr(address(assetConfig.token));

        Loan memory loan;
        uint8 decimals = assetConfig.decimals;
        loan.collateralAmt = SafeCast.toUint128(auctionEnd.collateralAmt.toL1Amt(decimals));

        // debt token config
        (IERC20 underlyingAsset, uint32 maturityTime) = tsbToken.tokenInfo();
        (uint16 debtTokenId, AssetConfig memory underlyingAssetConfig) = tsl.getAssetConfig(underlyingAsset);
        decimals = underlyingAssetConfig.decimals;
        loan.debtAmt = SafeCast.toUint128(auctionEnd.debtAmt.toL1Amt(decimals));
        bytes12 loanId = LoanLib.calcLoanId(auctionEnd.accountId, maturityTime, debtTokenId, collateralTokenId);

        return (loanId, loan);
    }

    /// @notice Internal function to withdraw fee to treasury, vault, and insurance
    /// @param rsl The rollup storage
    /// @param withdrawFee The withdraw fee request
    function _withdrawFee(RollupStorage.Layout storage rsl, Operations.WithdrawFee memory withdrawFee) internal {
        uint16 tokenId = withdrawFee.tokenId;
        AssetConfig memory assetConfig = TokenStorage.layout().getAssetConfig(tokenId);
        uint256 l1Amt = withdrawFee.amount.toL1Amt(assetConfig.decimals);
        ProtocolParamsStorage.Layout storage ppsl = ProtocolParamsStorage.layout();
        FundWeight memory fundWeight = ppsl.getFundWeight();

        // insurance
        address toAddr = ppsl.getInsuranceAddr();
        Utils.notZeroAddr(toAddr);
        uint256 insuranceAmt = l1Amt.mulDiv(fundWeight.insurance, Config.FUND_WEIGHT_BASE);
        rsl.addPendingBalance(toAddr, tokenId, insuranceAmt);

        // vault
        toAddr = ppsl.getVaultAddr();
        Utils.notZeroAddr(toAddr);
        uint256 vaultAmt = l1Amt.mulDiv(fundWeight.vault, Config.FUND_WEIGHT_BASE);
        rsl.addPendingBalance(toAddr, tokenId, vaultAmt);

        // treasury
        toAddr = ppsl.getTreasuryAddr();
        Utils.notZeroAddr(toAddr);
        uint256 treasuryAmt = l1Amt - insuranceAmt - vaultAmt;
        rsl.addPendingBalance(toAddr, tokenId, treasuryAmt);
    }

    /// @notice Internal function to evacuate token to L1
    /// @param rsl The rollup storage layout
    /// @param evacuation The evacuation request
    function _evacuate(RollupStorage.Layout storage rsl, Operations.Evacuation memory evacuation) internal {
        uint32 accountId = evacuation.accountId;
        uint16 tokenId = evacuation.tokenId;
        if (rsl.isEvacuated(accountId, tokenId)) revert Evacuated(accountId, tokenId);

        address receiver = AccountStorage.layout().getAccountAddr(accountId);
        Utils.notZeroAddr(receiver);

        AssetConfig memory assetConfig = TokenStorage.layout().getAssetConfig(tokenId);
        IERC20 token = assetConfig.token;
        Utils.notZeroAddr(address(token));

        rsl.evacuated[accountId][tokenId] = true;

        bytes memory pubData = Operations.encodeEvacuationPubData(evacuation);
        rsl.addL1Request(receiver, Operations.OpType.EVACUATION, pubData);

        uint256 l1Amt = evacuation.amount.toL1Amt(assetConfig.decimals);
        Utils.tokenTransfer(token, payable(receiver), l1Amt, assetConfig.isTsbToken);

        emit Evacuation(receiver, accountId, token, tokenId, l1Amt);
    }

    /// @notice Internal function calculate the commitment of the new block
    /// @dev    newTsRoot is packed in commitment for data availablity and will be proved in the circuit
    /// @param previousBlock The previous block
    /// @param newBlock The new block to be committed
    /// @param commitmentOffset The offset of the commitment
    /// @return commitment The commitment of the new block
    function _calcBlockCommitment(
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
