// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {SafeCast} from "@solidstate/contracts/utils/SafeCast.sol";
import {RollupStorage, Proof, StoredBlock, CommitBlock, ExecuteBlock, VerifyBlock, L1Request} from "./RollupStorage.sol";
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
 */
contract RollupFacet is IRollupFacet, AccessControlInternal {
    using AccountLib for AccountStorage.Layout;
    using AddressLib for AddressStorage.Layout;
    using ProtocolParamsLib for ProtocolParamsStorage.Layout;
    using RollupLib for RollupStorage.Layout;
    using TokenLib for TokenStorage.Layout;
    using LoanLib for *;
    using Utils for *;

    /**
     * @inheritdoc IRollupFacet
     */
    function commitBlocks(
        StoredBlock memory lastCommittedBlock,
        CommitBlock[] memory newBlocks
    ) external onlyRole(Config.COMMITTER_ROLE) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireActive();

        // Check whether the last committed block is valid
        if (rsl.getStoredBlockHash(rsl.getCommittedBlockNum()) != keccak256(abi.encode(lastCommittedBlock)))
            revert InvalidLastCommittedBlock(lastCommittedBlock);

        uint64 committedL1RequestNum = rsl.getCommittedL1RequestNum();
        for (uint32 i; i < newBlocks.length; ++i) {
            lastCommittedBlock = _commitOneBlock(rsl, lastCommittedBlock, newBlocks[i], committedL1RequestNum);
            committedL1RequestNum += lastCommittedBlock.l1RequestNum;
            rsl.storedBlockHashes[lastCommittedBlock.blockNumber] = keccak256(abi.encode(lastCommittedBlock));
            emit BlockCommitted(lastCommittedBlock.blockNumber, lastCommittedBlock.commitment);
        }

        if (committedL1RequestNum > rsl.getTotalL1RequestNum())
            revert CommittedRequestNumExceedTotalNum(committedL1RequestNum);

        rsl.committedL1RequestNum = committedL1RequestNum;
        rsl.committedBlockNum += uint32(newBlocks.length);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function verifyBlocks(VerifyBlock[] memory verifyingBlocks) external onlyRole(Config.VERIFIER_ROLE) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireActive();

        uint32 verifiedBlockNum = rsl.getVerifiedBlockNum();
        if (verifiedBlockNum + verifyingBlocks.length > rsl.getCommittedBlockNum())
            revert VerifiedBlockNumExceedCommittedNum(verifiedBlockNum);

        for (uint256 i; i < verifyingBlocks.length; ++i) {
            ++verifiedBlockNum;
            VerifyBlock memory verifyingBlock = verifyingBlocks[i];
            if (rsl.getStoredBlockHash(verifiedBlockNum) != keccak256(abi.encode(verifyingBlock.storedBlock)))
                revert InvalidCommittedBlock(verifyingBlock.storedBlock);

            _verifyOneBlock(verifyingBlock.storedBlock.commitment, verifyingBlock.proof, false);
            emit BlockVerified(verifyingBlock.storedBlock.blockNumber);
        }
        rsl.verifiedBlockNum = verifiedBlockNum;
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function executeBlocks(ExecuteBlock[] memory pendingBlocks) external onlyRole(Config.EXECUTER_ROLE) {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireActive();

        uint32 executedBlockNum = rsl.getExecutedBlockNum();
        if (executedBlockNum + pendingBlocks.length > rsl.getVerifiedBlockNum())
            revert ExecutedBlockNumExceedProvedNum(executedBlockNum);

        uint64 executedL1RequestNum = rsl.getExecutedL1RequestNum();
        for (uint32 i; i < pendingBlocks.length; ++i) {
            ExecuteBlock memory pendingBlock = pendingBlocks[i];
            if (
                keccak256(abi.encode(pendingBlock.storedBlock)) !=
                rsl.getStoredBlockHash(pendingBlock.storedBlock.blockNumber)
            ) revert InvalidExecutedBlock(pendingBlock);

            ++executedBlockNum;
            if (pendingBlock.storedBlock.blockNumber != executedBlockNum)
                revert InvalidExecutedBlockNum(pendingBlock.storedBlock.blockNumber);

            _executeOneBlock(rsl, pendingBlock);
            executedL1RequestNum += pendingBlock.storedBlock.l1RequestNum;
            emit BlockExecuted(pendingBlock.storedBlock.blockNumber);
        }
        rsl.executedBlockNum = executedBlockNum;
        rsl.executedL1RequestNum = executedL1RequestNum;
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function revertBlocks(StoredBlock[] memory revertedBlocks) external onlyRole(Config.COMMITTER_ROLE) {
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
            if (rsl.getStoredBlockHash(committedBlockNum) != keccak256(abi.encode(revertedBlock)))
                revert InvalidLastCommittedBlock(revertedBlock);

            delete rsl.storedBlockHashes[committedBlockNum];
            --committedBlockNum;
            revertedL1RequestNum += revertedBlock.l1RequestNum;
        }

        rsl.committedBlockNum = committedBlockNum;
        rsl.committedL1RequestNum -= revertedL1RequestNum;
        if (committedBlockNum < rsl.getVerifiedBlockNum()) rsl.verifiedBlockNum = committedBlockNum;
        emit BlockReverted(committedBlockNum);
    }

    /**
     * @inheritdoc IRollupFacet
     * @dev The evacuate fuction will not commit a new state root to make all the users evacuate their funds from the same state
     */
    function evacuate(StoredBlock memory lastExecutedBlock, CommitBlock memory newBlock, Proof memory proof) external {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        if (!rsl.isEvacuMode()) revert NotEvacuMode();
        if (rsl.getStoredBlockHash(rsl.getExecutedBlockNum()) != keccak256(abi.encode(lastExecutedBlock)))
            revert InvalidLastExecutedBlock(lastExecutedBlock);
        if (newBlock.timestamp < lastExecutedBlock.timestamp)
            revert TimestampLtPrevious(newBlock.timestamp, lastExecutedBlock.timestamp);
        if (newBlock.blockNumber != lastExecutedBlock.blockNumber + 1) revert InvalidBlockNum(newBlock.blockNumber);

        // Commit the new block
        bytes memory publicData = newBlock.publicData;
        if (publicData.length % Config.CHUNK_BYTES != 0) revert InvalidPubDataLength(publicData.length);

        bytes memory commitmentOffset = new bytes(1);
        commitmentOffset[0] = 0x80; // 0b10000000

        bytes32 commitment = _createBlockCommitment(lastExecutedBlock, newBlock, commitmentOffset);

        // Verify the new block
        _verifyOneBlock(commitment, proof, true);
        // Execute the new block
        Operations.Evacuation memory evacuation = Operations.readEvacuationPubdata(newBlock.publicData);
        _evacuate(rsl, evacuation);
    }

    /**
     * @inheritdoc IRollupFacet
     * @dev The evacuation mode will be activated when the current block number is greater than the expiration block number of the first pending L1 request
     */
    function activateEvacuation() external {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireActive();
        uint32 expirationTime = rsl.getL1Request(rsl.getExecutedL1RequestNum()).expirationTime;
        // If all the L1 requests are executed, the first pending L1 request is empty and the expirationBlock of empty L1 requets is 0

        if (block.timestamp > expirationTime && expirationTime != 0) {
            rsl.evacuMode = true;
            emit EvacuationActivation(block.timestamp);
        } else {
            revert TimeStampIsNotExpired(block.timestamp, expirationTime);
        }
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function isEvacuMode() external view returns (bool) {
        return RollupLib.getRollupStorage().isEvacuMode();
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function isRegisterInL1RequestQueue(
        Operations.Register memory register,
        uint64 requestId
    ) external view returns (bool) {
        RollupStorage.Layout storage rsl = RollupLib.getRollupStorage();
        if (rsl.isRequestIdGtCurRequestNum(requestId)) return false;
        L1Request memory request = rsl.getL1Request(requestId);
        return RollupLib.isRegisterInL1RequestQueue(register, request);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function isDepositInL1RequestQueue(
        Operations.Deposit memory deposit,
        uint64 requestId
    ) external view returns (bool) {
        RollupStorage.Layout storage rsl = RollupLib.getRollupStorage();
        if (rsl.isRequestIdGtCurRequestNum(requestId)) return false;
        L1Request memory request = rsl.getL1Request(requestId);
        return RollupLib.isDepositInL1RequestQueue(deposit, request);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function isForceWithdrawInL1RequestQueue(
        Operations.ForceWithdraw memory forceWithdraw,
        uint64 requestId
    ) external view returns (bool) {
        RollupStorage.Layout storage rsl = RollupLib.getRollupStorage();
        if (rsl.isRequestIdGtCurRequestNum(requestId)) return false;
        L1Request memory request = rsl.getL1Request(requestId);
        return RollupLib.isForceWithdrawInL1RequestQueue(forceWithdraw, request);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getL1Request(uint64 requestId) external view returns (L1Request memory) {
        return RollupLib.getRollupStorage().getL1Request(requestId);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getL1RequestNum() external view returns (uint64, uint64, uint64) {
        RollupStorage.Layout storage rsl = RollupLib.getRollupStorage();
        return (rsl.getCommittedL1RequestNum(), rsl.getExecutedL1RequestNum(), rsl.getTotalL1RequestNum());
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getBlockNum() external view returns (uint32, uint32, uint32) {
        RollupStorage.Layout storage rsl = RollupLib.getRollupStorage();
        return (rsl.getCommittedBlockNum(), rsl.getVerifiedBlockNum(), rsl.getExecutedBlockNum());
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getStoredBlockHash(uint32 blockNum) external view returns (bytes32) {
        return RollupLib.getRollupStorage().getStoredBlockHash(blockNum);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getPendingBalances(address accountAddr, address tokenAddr) external view returns (uint256) {
        uint16 tokenId = TokenLib.getTokenStorage().getTokenId(tokenAddr);
        bytes22 key = RollupLib.getPendingBalanceKey(accountAddr, tokenId);
        return RollupLib.getRollupStorage().getPendingBalances(key);
    }

    /// @notice Internal function to commit one block
    /// @param rsl Rollup storage layout
    /// @param previousBlock The previous block
    /// @param newBlock The new block to be committed
    /// @param committedL1RequestNum The committed L1 request number
    /// @return storedBlock The committed block
    function _commitOneBlock(
        RollupStorage.Layout storage rsl,
        StoredBlock memory previousBlock,
        CommitBlock memory newBlock,
        uint64 committedL1RequestNum
    ) internal view returns (StoredBlock memory) {
        if (newBlock.timestamp < previousBlock.timestamp)
            revert TimestampLtPrevious(newBlock.timestamp, previousBlock.timestamp);
        if (newBlock.blockNumber != previousBlock.blockNumber + 1) revert InvalidBlockNum(newBlock.blockNumber);

        uint256 publicDataLength = newBlock.publicData.length;
        if (publicDataLength % Config.CHUNK_BYTES != 0) revert InvalidPubDataLength(publicDataLength);

        uint256 chunkId;
        uint64 requestId = committedL1RequestNum;
        bytes32 processableRollupTxHash = Config.EMPTY_STRING_KECCAK;
        // The commitment offset array is used to store the commitment offset for each chunk
        bytes memory commitmentOffset = new bytes(publicDataLength / Config.CHUNK_BYTES / Config.BITS_OF_BYTE);

        for (uint256 i; i < newBlock.chunkIdDeltas.length; ++i) {
            chunkId += newBlock.chunkIdDeltas[i];
            uint256 offset = chunkId * Config.CHUNK_BYTES;
            if (offset >= publicDataLength) revert OffsetGtPubDataLength(offset);

            commitmentOffset = _updateCommitmentOffsetForChunk(commitmentOffset, chunkId);
            (bytes memory data, bool isL1Request, bool isToBeExecuted) = _processOneRequest(
                rsl,
                newBlock.publicData,
                offset,
                requestId
            );
            // If processed request is L1 request, increase the L1 request id
            if (isL1Request) ++requestId;
            // If processed request is to be executed, update the processable rollup tx hash for executing the request when executeBlock
            if (isToBeExecuted) processableRollupTxHash = keccak256(abi.encode(processableRollupTxHash, data));
        }

        uint64 processedL1RequestNum = requestId - committedL1RequestNum;
        bytes32 commitment = _createBlockCommitment(previousBlock, newBlock, commitmentOffset);
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

    /// @notice Internal function to update the commitment offset for the chunk
    /// @param commitmentOffset The commitment offset
    /// @param chunkId The chunk id
    /// @return commitmentOffset The updated commitment offset
    function _updateCommitmentOffsetForChunk(
        bytes memory commitmentOffset,
        uint256 chunkId
    ) internal pure returns (bytes memory) {
        uint256 chunkIndex = chunkId / Config.BITS_OF_BYTE;
        uint8 processingCommitmentOffset = uint8(commitmentOffset[chunkIndex]);
        uint8 bitwiseMask = uint8(1 << (Config.LAST_INDEX_OF_BYTE - (chunkId % Config.BITS_OF_BYTE)));
        if (processingCommitmentOffset & bitwiseMask != 0) revert OffsetIsSet(chunkId);

        commitmentOffset[chunkIndex] = bytes1(processingCommitmentOffset | bitwiseMask);
        return commitmentOffset;
    }

    /// @notice Process one request
    /// @param rsl The rollup storage layout
    /// @param publicData The public data of the new block
    /// @param offset The offset of the public data
    /// @param requestId The request id of the new block
    /// @return data The data of the request
    /// @return isL1Request Whether the request is L1 request
    /// @return isToBeExecuted Whether the request is to be executed on L1 when executing the new block
    function _processOneRequest(
        RollupStorage.Layout storage rsl,
        bytes memory publicData,
        uint256 offset,
        uint64 requestId
    ) internal view returns (bytes memory, bool, bool) {
        bytes memory data;
        bool isL1Request;
        bool isToBeExecuted;
        Operations.OpType opType = Operations.OpType(uint8(publicData[offset]));

        // non L1 request
        if (opType == Operations.OpType.WITHDRAW) {
            data = Bytes.sliceWithdrawData(publicData, offset);
            isToBeExecuted = true;
        } else if (opType == Operations.OpType.AUCTION_END) {
            data = Bytes.sliceAuctionEndData(publicData, offset);
            isToBeExecuted = true;
        } else if (opType == Operations.OpType.WITHDRAW_FEE) {
            data = Bytes.sliceWithdrawFeeData(publicData, offset);
            isToBeExecuted = true;
        } else if (opType == Operations.OpType.CREATE_TSB_TOKEN) {
            data = Bytes.sliceCreateTsbTokenData(publicData, offset);
            Operations.CreateTsbToken memory createTsbTokenReq = Operations.readCreateTsbTokenPubData(data);
            TokenStorage.Layout storage tsl = TokenLib.getTokenStorage();
            AssetConfig memory tsbTokenConfig = tsl.getAssetConfig(createTsbTokenReq.tsbTokenId);
            AssetConfig memory baseTokenConfig = tsl.getAssetConfig(createTsbTokenReq.baseTokenId);
            (address underlyingAssetAddr, uint32 maturityTime) = ITsbToken(tsbTokenConfig.tokenAddr).tokenInfo();
            if (underlyingAssetAddr != baseTokenConfig.tokenAddr)
                revert TokenIsNotMatched(underlyingAssetAddr, baseTokenConfig.tokenAddr);
            if (maturityTime != createTsbTokenReq.maturityTime)
                revert MaturityTimeIsNotMatched(maturityTime, createTsbTokenReq.maturityTime);
        } else {
            // L1 request
            isL1Request = true;
            L1Request memory request = rsl.getL1Request(requestId);
            if (opType == Operations.OpType.REGISTER) {
                data = Bytes.sliceRegisterData(publicData, offset);
                Operations.Register memory register = Operations.readRegisterPubData(data);
                RollupLib.isRegisterInL1RequestQueue(register, request);
            } else if (opType == Operations.OpType.DEPOSIT) {
                data = Bytes.sliceDepositData(publicData, offset);
                Operations.Deposit memory deposit = Operations.readDepositPubData(data);
                RollupLib.isDepositInL1RequestQueue(deposit, request);
            } else if (opType == Operations.OpType.EVACUATION) {
                data = Bytes.sliceEvacuationData(publicData, offset);
                Operations.Evacuation memory evacuation = Operations.readEvacuationPubdata(data);
                RollupLib.isEvacuationInL1RequestQueue(evacuation, request);
                isToBeExecuted = true;
            } else if (opType == Operations.OpType.FORCE_WITHDRAW) {
                data = Bytes.sliceForceWithdrawData(publicData, offset);
                Operations.ForceWithdraw memory forceWithdrawReq = Operations.readForceWithdrawPubData(data);
                RollupLib.isForceWithdrawInL1RequestQueue(forceWithdrawReq, request);
                isToBeExecuted = true;
            } else {
                revert InvalidOpType(opType);
            }
        }
        return (data, isL1Request, isToBeExecuted);
    }

    /// @notice Internal function to execute one block
    /// @param rsl The rollup storage layout
    /// @param executeBlock The block to be executed
    function _executeOneBlock(RollupStorage.Layout storage rsl, ExecuteBlock memory executeBlock) internal {
        bytes32 pendingRollupTxHash = Config.EMPTY_STRING_KECCAK;
        bytes memory pubData;
        for (uint32 i; i < executeBlock.pendingRollupTxPubData.length; ++i) {
            pubData = executeBlock.pendingRollupTxPubData[i];
            Operations.OpType opType = Operations.OpType(uint8(pubData[0]));
            if (opType == Operations.OpType.WITHDRAW) {
                Operations.Withdraw memory withdrawReq = Operations.readWithdrawPubData(pubData);
                _addPendingBalance(rsl, withdrawReq.accountId, withdrawReq.tokenId, withdrawReq.amount);
            } else if (opType == Operations.OpType.FORCE_WITHDRAW) {
                Operations.ForceWithdraw memory forceWithdrawReq = Operations.readForceWithdrawPubData(pubData);
                _addPendingBalance(rsl, forceWithdrawReq.accountId, forceWithdrawReq.tokenId, forceWithdrawReq.amount);
            } else if (opType == Operations.OpType.AUCTION_END) {
                Operations.AuctionEnd memory auctionEnd = Operations.readAuctionEndPubData(pubData);
                _updateLoan(auctionEnd);
            } else if (opType == Operations.OpType.WITHDRAW_FEE) {
                Operations.WithdrawFee memory withdrawFee = Operations.readWithdrawFeePubdata(pubData);
                _withdrawFee(withdrawFee);
            } else if (opType == Operations.OpType.EVACUATION) {
                Operations.Evacuation memory evacuation = Operations.readEvacuationPubdata(pubData);
                rsl.evacuated[evacuation.accountId][evacuation.tokenId] = false;
            } else {
                revert InvalidOpType(opType);
            }
            pendingRollupTxHash = keccak256(abi.encode(pendingRollupTxHash, pubData));
        }

        if (pendingRollupTxHash != executeBlock.storedBlock.pendingRollupTxHash)
            revert PendingRollupTxHashIsNotMatched(pendingRollupTxHash, executeBlock.storedBlock.pendingRollupTxHash);
    }

    /// @notice Internal function create the commitment of the new block
    /// @param previousBlock The previous block
    /// @param newBlock The new block to be committed
    /// @param commitmentOffset The offset of the commitment
    /// @return commitment The commitment of the new block
    function _createBlockCommitment(
        StoredBlock memory previousBlock,
        CommitBlock memory newBlock,
        bytes memory commitmentOffset
    ) internal pure returns (bytes32) {
        // newTsRoot is packed in commitment for data availablity and will be proved in the circuit
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

    /// @notice Internal function to verify one block
    /// @param commitment The commitment of the block
    /// @param proof The proof of the block
    function _verifyOneBlock(bytes32 commitment, Proof memory proof, bool isEvacuationBlock) internal view {
        if (proof.commitment[0] != uint256(commitment) % Config.SCALAR_FIELD_SIZE)
            revert CommitmentInconsistant(proof.commitment[0], uint256(commitment));

        AddressStorage.Layout storage asl = AddressStorage.layout();
        IVerifier verifier = isEvacuationBlock
            ? IVerifier(asl.getEvacuVerifierAddr())
            : IVerifier(asl.getVerifierAddr());

        if (!verifier.verifyProof(proof.a, proof.b, proof.c, proof.commitment)) revert InvalidProof(proof);
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
        address accountAddr = AccountLib.getAccountStorage().getAccountAddr(accountId);
        Utils.noneZeroAddr(accountAddr);

        TokenStorage.Layout storage tsl = TokenLib.getTokenStorage();
        AssetConfig memory assetConfig = tsl.getAssetConfig(tokenId);
        Utils.noneZeroAddr(assetConfig.tokenAddr);

        bytes22 key = RollupLib.getPendingBalanceKey(accountAddr, tokenId);
        uint256 l1Amt = l2Amt.toL1Amt(assetConfig.decimals);
        rsl.pendingBalances[key] += l1Amt;
    }

    /// @notice Internal function to update the onchain loan info
    /// @param auctionEnd The auction end request
    function _updateLoan(Operations.AuctionEnd memory auctionEnd) internal {
        Utils.noneZeroAddr(AccountLib.getAccountStorage().getAccountAddr(auctionEnd.accountId));

        TokenStorage.Layout storage tsl = TokenStorage.layout();
        // tsbToken config
        AssetConfig memory assetConfig = tsl.getAssetConfig(auctionEnd.tsbTokenId);
        Utils.noneZeroAddr(assetConfig.tokenAddr);
        if (!assetConfig.isTsbToken) revert InvalidTsbTokenAddr(assetConfig.tokenAddr);

        // debt token config
        (address underlyingAsset, uint32 maturityTime) = ITsbToken(assetConfig.tokenAddr).tokenInfo();
        (uint16 debtTokenId, AssetConfig memory underlyingAssetConfig) = tsl.getAssetConfig(underlyingAsset);

        // collateral token config
        assetConfig = tsl.getAssetConfig(auctionEnd.collateralTokenId);
        Utils.noneZeroAddr(assetConfig.tokenAddr);

        // update loan info
        bytes12 loanId = LoanLib.getLoanId(
            auctionEnd.accountId,
            maturityTime,
            debtTokenId,
            auctionEnd.collateralTokenId
        );

        LoanStorage.Layout storage lsl = LoanStorage.layout();
        Loan memory loan = lsl.getLoan(loanId);
        loan.accountId = auctionEnd.accountId;
        loan.debtTokenId = debtTokenId;
        loan.collateralTokenId = auctionEnd.collateralTokenId;
        loan.maturityTime = maturityTime;

        // calculate added amount
        uint8 decimals = underlyingAssetConfig.decimals;
        uint128 addedDebtAmt = SafeCast.toUint128(Utils.toL1Amt(auctionEnd.debtAmt, decimals));
        decimals = assetConfig.decimals;
        uint128 addedCollateralAmt = SafeCast.toUint128(Utils.toL1Amt(auctionEnd.collateralAmt, decimals));

        // loan.debtAmt += addedDebtAmt;
        // loan.collateralAmt += addedCollateralAmt;
        loan = loan.updateLoan(addedCollateralAmt, addedDebtAmt);
        lsl.loans[loanId] = loan;

        emit UpdateLoan(
            loanId,
            loan.accountId,
            loan.maturityTime,
            assetConfig.tokenAddr,
            underlyingAssetConfig.tokenAddr,
            addedCollateralAmt,
            addedDebtAmt
        );
    }

    /// @notice Internal function to withdraw fee to treasury, vault, and insurance
    /// @param withdrawFee The withdraw fee request
    function _withdrawFee(Operations.WithdrawFee memory withdrawFee) internal {
        AssetConfig memory assetConfig = TokenLib.getTokenStorage().getAssetConfig(withdrawFee.tokenId);
        uint128 l1Amt = SafeCast.toUint128(Utils.toL1Amt(withdrawFee.amount, assetConfig.decimals));
        ProtocolParamsStorage.Layout storage ppsl = ProtocolParamsStorage.layout();
        FundWeight memory fundWeight = ppsl.getFundWeight();
        // insurance
        uint128 amount = (l1Amt * fundWeight.insurance) / Config.FUND_WEIGHT_BASE;
        address toAddr = ppsl.getInsuranceAddr();
        Utils.noneZeroAddr(toAddr);
        Utils.transfer(assetConfig.tokenAddr, payable(toAddr), amount);
        l1Amt -= amount;
        // vault
        amount = (l1Amt * fundWeight.vault) / Config.FUND_WEIGHT_BASE;
        toAddr = ppsl.getVaultAddr();
        Utils.noneZeroAddr(toAddr);
        Utils.transfer(assetConfig.tokenAddr, payable(toAddr), amount);
        l1Amt -= amount;
        // treasury
        toAddr = ppsl.getTreasuryAddr();
        Utils.noneZeroAddr(toAddr);
        Utils.transfer(assetConfig.tokenAddr, payable(toAddr), l1Amt);
    }

    /// @notice Internal function to evacuate token to L1
    /// @param rsl The rollup storage layout
    /// @param evacuation The evacuation request
    function _evacuate(RollupStorage.Layout storage rsl, Operations.Evacuation memory evacuation) internal {
        if (rsl.isEvacuated(evacuation.accountId, evacuation.tokenId))
            revert Evacuated(evacuation.accountId, evacuation.tokenId);

        address receiver = AccountLib.getAccountStorage().getAccountAddr(evacuation.accountId);
        Utils.noneZeroAddr(receiver);

        AssetConfig memory assetConfig = TokenLib.getTokenStorage().getAssetConfig(evacuation.tokenId);
        Utils.noneZeroAddr(assetConfig.tokenAddr);

        rsl.evacuated[evacuation.accountId][evacuation.tokenId] = true;

        bytes memory pubData = Operations.encodeEvacuationPubData(evacuation);
        rsl.addL1Request(receiver, Operations.OpType.EVACUATION, pubData);

        uint256 l1Amt = evacuation.amount.toL1Amt(assetConfig.decimals);
        Utils.transfer(assetConfig.tokenAddr, payable(receiver), l1Amt);
        emit Evacuation(receiver, evacuation.accountId, assetConfig.tokenAddr, evacuation.tokenId, l1Amt);
    }
}
