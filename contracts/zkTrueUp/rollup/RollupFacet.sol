// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {SafeCast} from "@solidstate/contracts/utils/SafeCast.sol";
import {RollupStorage, StoredBlock, CommitBlock, ExecuteBlock, Proof, L1Request} from "./RollupStorage.sol";
import {FundWeight} from "../protocolParams/ProtocolParamsStorage.sol";
import {LoanStorage, Loan} from "../loan/LoanStorage.sol";
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
    /**
     * @inheritdoc IRollupFacet
     */
    function commitBlocks(
        StoredBlock memory lastCommittedBlock,
        CommitBlock[] memory newBlocks
    ) external onlyRole(Config.COMMITTER_ROLE) {
        RollupLib.requireActive();
        // Check whether the last committed block is valid
        if (RollupLib.getStoredBlockHash(RollupLib.getCommittedBlockNum()) != keccak256(abi.encode(lastCommittedBlock)))
            revert InvalidLastCommittedBlock(lastCommittedBlock);

        uint64 committedL1RequestNum = RollupLib.getCommittedL1RequestNum();
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        for (uint32 i; i < newBlocks.length; ++i) {
            lastCommittedBlock = _commitOneBlock(lastCommittedBlock, newBlocks[i]);
            committedL1RequestNum += lastCommittedBlock.l1RequestNum;
            rsl.storedBlockHashes[lastCommittedBlock.blockNumber] = keccak256(abi.encode(lastCommittedBlock));
            emit BlockCommitted(lastCommittedBlock.blockNumber, lastCommittedBlock.commitment);
        }

        if (committedL1RequestNum > RollupLib.getTotalL1RequestNum())
            revert CommittedRequestNumExceedTotalNum(committedL1RequestNum);

        rsl.committedL1RequestNum = committedL1RequestNum;
        rsl.committedBlockNum += uint32(newBlocks.length);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function verifyBlocks(
        StoredBlock[] memory committedBlocks,
        Proof[] memory proof
    ) external onlyRole(Config.VERIFIER_ROLE) {
        RollupLib.requireActive();
        uint32 verifiedBlockNum = RollupLib.getVerifiedBlockNum();
        for (uint256 i; i < committedBlocks.length; i++) {
            if (RollupLib.getStoredBlockHash(++verifiedBlockNum) != keccak256(abi.encode(committedBlocks[i])))
                revert InvalidCommittedBlock(committedBlocks[i]);
            _verifyOneBlock(committedBlocks[i], proof[i]);

            emit BlockVerified(committedBlocks[i].blockNumber);
        }
        if (verifiedBlockNum > RollupLib.getCommittedBlockNum())
            revert VerifiedBlockNumExceedCommittedNum(verifiedBlockNum);
        RollupStorage.layout().verifiedBlockNum = verifiedBlockNum;
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function executeBlocks(ExecuteBlock[] memory pendingBlocks) external onlyRole(Config.EXECUTER_ROLE) {
        RollupLib.requireActive();
        uint32 blockNum = uint32(pendingBlocks.length);
        uint32 executedBlockNum = RollupLib.getExecutedBlockNum();
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        for (uint32 i; i < blockNum; ++i) {
            _executeOneBlock(pendingBlocks[i], i);
            rsl.executedL1RequestNum += pendingBlocks[i].storedBlock.l1RequestNum;
            emit BlockExecuted(pendingBlocks[i].storedBlock.blockNumber);
        }
        executedBlockNum += blockNum;
        if (executedBlockNum > RollupLib.getVerifiedBlockNum())
            revert ExecutedBlockNumExceedProvedNum(executedBlockNum);
        rsl.executedBlockNum = executedBlockNum;
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function revertBlocks(StoredBlock[] memory revertedBlocks) external onlyRole(Config.COMMITTER_ROLE) {
        RollupLib.requireActive();
        uint32 committedBlockNum = RollupLib.getCommittedBlockNum();
        uint32 executedBlockNum = RollupLib.getExecutedBlockNum();
        uint32 pendingBlockNum = committedBlockNum - executedBlockNum;
        uint32 revertBlockNum = uint32(revertedBlocks.length) < pendingBlockNum
            ? uint32(revertedBlocks.length)
            : pendingBlockNum;
        uint64 revertedL1RequestNum;

        RollupStorage.Layout storage rsl = RollupStorage.layout();
        for (uint32 i; i < revertBlockNum; ++i) {
            StoredBlock memory revertedBlock = revertedBlocks[i];
            if (RollupLib.getStoredBlockHash(committedBlockNum) != keccak256(abi.encode(revertedBlock)))
                revert InvalidLastCommittedBlock(revertedBlock);
            delete rsl.storedBlockHashes[committedBlockNum];
            --committedBlockNum;
            revertedL1RequestNum += revertedBlock.l1RequestNum;
        }

        rsl.committedBlockNum = committedBlockNum;
        rsl.committedL1RequestNum -= revertedL1RequestNum;
        if (committedBlockNum < RollupLib.getVerifiedBlockNum()) rsl.verifiedBlockNum = committedBlockNum;

        emit BlockReverted(committedBlockNum);
    }

    /**
     * @inheritdoc IRollupFacet
     * @dev The evacuate fuction will not commit a new state root to make all the users evacuate their funds from the same state
     */
    function evacuate(StoredBlock memory lastExecutedBlock, CommitBlock memory newBlock, Proof memory proof) external {
        if (!RollupLib.isEvacuMode()) revert NotEvacuMode();
        if (RollupLib.getStoredBlockHash(RollupLib.getExecutedBlockNum()) != keccak256(abi.encode(lastExecutedBlock)))
            revert InvalidLastExecutedBlock(lastExecutedBlock);
        if (newBlock.timestamp < lastExecutedBlock.timestamp)
            revert TimestampLtPrevious(newBlock.timestamp, lastExecutedBlock.timestamp);
        if (newBlock.blockNumber != lastExecutedBlock.blockNumber + 1) revert InvalidBlockNum(newBlock.blockNumber);

        // Commit the new block
        bytes memory publicData = newBlock.publicData;
        if (publicData.length % Config.CHUNK_BYTES != 0) revert InvalidPubDataLength(publicData.length);

        bytes memory commitmentOffset = new bytes(2);
        commitmentOffset[0] = 0x01;
        commitmentOffset[1] = 0x00;
        bytes32 commitment = _createBlockCommitment(lastExecutedBlock, newBlock, commitmentOffset);

        // Verify the new block
        _verifyEvacuationBlock(commitment, proof);
        // Execute the new block
        Operations.Evacuation memory evacuation = Operations.readEvacuationPubdata(newBlock.publicData);
        _evacuate(evacuation);
    }

    /**
     * @inheritdoc IRollupFacet
     * @dev The evacuation mode will be activated when the current block number is greater than the expiration block number of the first pending L1 request
     */
    function activateEvacuation() external {
        RollupLib.requireActive();
        uint64 expirationBlock = RollupLib.getL1Request(RollupLib.getExecutedL1RequestNum()).expirationBlock;
        // If all the L1 requests are executed, the first pending L1 request is empty and the expirationBlock of empty L1 requets is 0
        bool evacuMode = block.number >= expirationBlock && expirationBlock != 0;

        if (evacuMode) {
            RollupStorage.layout().evacuMode = true;
            emit EvacuationActivated(block.number);
        }
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function isEvacuMode() external view returns (bool) {
        return RollupLib.isEvacuMode();
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function isRegisterInL1RequestQueue(
        Operations.Register memory register,
        uint64 requestId
    ) external view returns (bool) {
        if (_isRequestIdGtCurRequestNum(requestId)) return false;
        L1Request memory request = RollupLib.getL1Request(requestId);
        return RollupLib.isRegisterInL1RequestQueue(register, request);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function isDepositInL1RequestQueue(
        Operations.Deposit memory deposit,
        uint64 requestId
    ) external view returns (bool) {
        if (_isRequestIdGtCurRequestNum(requestId)) return false;
        L1Request memory request = RollupLib.getL1Request(requestId);
        return RollupLib.isDepositInL1RequestQueue(deposit, request);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function isForceWithdrawInL1RequestQueue(
        Operations.ForceWithdraw memory forceWithdraw,
        uint64 requestId
    ) external view returns (bool) {
        if (_isRequestIdGtCurRequestNum(requestId)) return false;
        L1Request memory request = RollupLib.getL1Request(requestId);
        return RollupLib.isForceWithdrawInL1RequestQueue(forceWithdraw, request);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getL1Request(uint64 requestId) external view returns (L1Request memory) {
        return RollupLib.getL1Request(requestId);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getL1RequestNum() external view returns (uint64, uint64, uint64) {
        return (
            RollupLib.getCommittedL1RequestNum(),
            RollupLib.getExecutedL1RequestNum(),
            RollupLib.getTotalL1RequestNum()
        );
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getBlockNum() external view returns (uint32, uint32, uint32) {
        return (RollupLib.getCommittedBlockNum(), RollupLib.getVerifiedBlockNum(), RollupLib.getExecutedBlockNum());
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getStoredBlockHash(uint32 blockNum) external view returns (bytes32) {
        return RollupLib.getStoredBlockHash(blockNum);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getPendingBalances(address accountAddr, address tokenAddr) external view returns (uint128) {
        uint16 tokenId = TokenLib.getTokenId(tokenAddr);
        bytes22 key = RollupLib.getPendingBalanceKey(accountAddr, tokenId);
        return RollupLib.getPendingBalances(key);
    }

    /// @notice Internal function to commit one block
    /// @param previousBlock The previous block
    /// @param newBlock The new block to be committed
    /// @return storedBlock The committed block
    function _commitOneBlock(
        StoredBlock memory previousBlock,
        CommitBlock memory newBlock
    ) internal view returns (StoredBlock memory) {
        if (newBlock.timestamp < previousBlock.timestamp)
            revert TimestampLtPrevious(newBlock.timestamp, previousBlock.timestamp);
        if (newBlock.blockNumber != previousBlock.blockNumber + 1) revert InvalidBlockNum(newBlock.blockNumber);

        (
            bytes32 pendingRollupTxHash,
            uint64 committedL1RequestNum,
            bytes memory commitmentOffset
        ) = _collectRollupRequests(newBlock);

        bytes32 commitment = _createBlockCommitment(previousBlock, newBlock, commitmentOffset);

        return
            StoredBlock({
                blockNumber: newBlock.blockNumber,
                l1RequestNum: committedL1RequestNum,
                pendingRollupTxHash: pendingRollupTxHash,
                commitment: commitment,
                stateRoot: newBlock.newStateRoot,
                timestamp: newBlock.timestamp
            });
    }

    /// @notice Internal function to execute one block
    /// @param executeBlock The block to be executed
    /// @param blockNum The block number to be executed
    function _executeOneBlock(ExecuteBlock memory executeBlock, uint32 blockNum) internal {
        if (
            keccak256(abi.encode(executeBlock.storedBlock)) !=
            RollupLib.getStoredBlockHash(executeBlock.storedBlock.blockNumber)
        ) revert InvalidExecutedBlock(executeBlock);
        if (executeBlock.storedBlock.blockNumber != RollupLib.getExecutedBlockNum() + blockNum + 1)
            revert InvalidExecutedBlockNum(executeBlock.storedBlock.blockNumber);

        bytes32 pendingRollupTxHash = Config.EMPTY_STRING_KECCAK;
        for (uint32 i; i < executeBlock.pendingRollupTxPubData.length; ++i) {
            bytes memory pubData = executeBlock.pendingRollupTxPubData[i];
            uint8 decimals;
            uint128 amount;
            Operations.OpType opType = Operations.OpType(uint8(pubData[0]));
            if (opType == Operations.OpType.WITHDRAW) {
                Operations.Withdraw memory withdrawReq = Operations.readWithdrawPubData(pubData);
                decimals = TokenLib.getAssetConfig(withdrawReq.tokenId).decimals;
                amount = Utils.toL1Amt(withdrawReq.amount, decimals);
                _addPendingBalance(withdrawReq.accountId, withdrawReq.tokenId, amount);
            } else if (opType == Operations.OpType.FORCE_WITHDRAW) {
                Operations.ForceWithdraw memory forceWithdrawReq = Operations.readForceWithdrawPubData(pubData);
                decimals = TokenLib.getAssetConfig(forceWithdrawReq.tokenId).decimals;
                amount = Utils.toL1Amt(forceWithdrawReq.amount, decimals);
                _addPendingBalance(forceWithdrawReq.accountId, forceWithdrawReq.tokenId, amount);
            } else if (opType == Operations.OpType.AUCTION_END) {
                Operations.AuctionEnd memory auctionEnd = Operations.readAuctionEndPubData(pubData);
                _updateLoan(auctionEnd);
            } else if (opType == Operations.OpType.WITHDRAW_FEE) {
                Operations.WithdrawFee memory withdrawFee = Operations.readWithdrawFeePubdata(pubData);
                _withdrawFee(withdrawFee);
            } else if (opType == Operations.OpType.EVACUATION) {
                Operations.Evacuation memory evacuation = Operations.readEvacuationPubdata(pubData);
                RollupStorage.layout().evacuated[evacuation.accountId][evacuation.tokenId] = false;
            } else {
                revert InvalidOpType(opType);
            }
            pendingRollupTxHash = keccak256(abi.encodePacked(pendingRollupTxHash, pubData));
        }

        if (pendingRollupTxHash != executeBlock.storedBlock.pendingRollupTxHash)
            revert PendingRollupTxHashIsNotMatched();
    }

    /// @notice Internal function to collect and check the rollup requests
    /// @param newBlock The new block to be committed
    /// @return processableRollupTxHash The hash of the rollup txs to be processed
    /// @return nextCommittedL1RequestId The next committed L1 request ID
    /// @return commitmentOffset The offset of the commitment
    function _collectRollupRequests(CommitBlock memory newBlock) internal view returns (bytes32, uint64, bytes memory) {
        bytes memory publicData = newBlock.publicData;
        uint64 nextCommittedL1RequestId = RollupLib.getCommittedL1RequestNum();
        bytes32 processableRollupTxHash = Config.EMPTY_STRING_KECCAK;
        if (publicData.length % Config.CHUNK_BYTES != 0) revert InvalidPubDataLength(publicData.length);
        bytes memory commitmentOffset = new bytes(publicData.length / Config.CHUNK_BYTES);
        uint64 processedL1RequestNum;
        uint256 offset;
        uint256 chunkId;
        L1Request memory request;
        bytes memory rollupData;
        for (uint256 i; i < newBlock.publicDataOffsets.length; i++) {
            offset = newBlock.publicDataOffsets[i];
            if (offset >= publicData.length) revert OffsetGtPubDataLength(offset);
            if (offset % Config.CHUNK_BYTES != 0) revert InvalidOffset(offset);
            chunkId = offset / Config.CHUNK_BYTES;
            if (commitmentOffset[chunkId] != bytes1(0x00)) revert OffsetIsSet(chunkId);
            commitmentOffset[chunkId] = bytes1(0x01);
            Operations.OpType opType = Operations.OpType(uint8(publicData[offset]));
            if (opType == Operations.OpType.REGISTER) {
                rollupData = Bytes.slice(publicData, offset, Config.REGISTER_BYTES);
                Operations.Register memory register = Operations.readRegisterPubData(rollupData);
                request = RollupLib.getL1Request(nextCommittedL1RequestId + processedL1RequestNum);
                if (!RollupLib.isRegisterInL1RequestQueue(register, request)) revert RequestIsNotExisted(request);
                ++processedL1RequestNum;
            } else if (opType == Operations.OpType.DEPOSIT) {
                rollupData = Bytes.slice(publicData, offset, Config.DEPOSIT_BYTES);
                Operations.Deposit memory deposit = Operations.readDepositPubData(rollupData);
                request = RollupLib.getL1Request(nextCommittedL1RequestId + processedL1RequestNum);
                if (!RollupLib.isDepositInL1RequestQueue(deposit, request)) revert RequestIsNotExisted(request);
                ++processedL1RequestNum;
            } else if (opType == Operations.OpType.CREATE_TS_BOND_TOKEN) {
                rollupData = Bytes.slice(publicData, offset, Config.CREATE_TS_BOND_TOKEN_BYTES);
                Operations.CreateTsbToken memory CreateTsbTokenReq = Operations.readCreateTsbTokenPubData(rollupData);
                AssetConfig memory tsbTokenConfig = TokenLib.getAssetConfig(CreateTsbTokenReq.tsbTokenId);
                AssetConfig memory baseTokenConfig = TokenLib.getAssetConfig(CreateTsbTokenReq.baseTokenId);
                (address underlyingAsset, uint32 maturityTime) = ITsbToken(tsbTokenConfig.tokenAddr).tokenInfo();
                if (underlyingAsset != baseTokenConfig.tokenAddr) revert BaseTokenAddrIsNotMatched();
                if (maturityTime != CreateTsbTokenReq.maturityTime) revert MaturityTimeIsNotMatched();
            } else if (opType == Operations.OpType.EVACUATION) {
                rollupData = Bytes.slice(publicData, offset, Config.EVACUATION_BYTES);
                Operations.Evacuation memory evacuation = Operations.readEvacuationPubdata(rollupData);
                request = RollupLib.getL1Request(nextCommittedL1RequestId + processedL1RequestNum);
                if (!RollupLib.isEvacuationInL1RequestQueue(evacuation, request)) revert RequestIsNotExisted(request);
                ++processedL1RequestNum;
            } else {
                bytes memory pubData;
                if (opType == Operations.OpType.WITHDRAW) {
                    pubData = Bytes.slice(publicData, offset, Config.WITHDRAW_BYTES);
                } else if (opType == Operations.OpType.FORCE_WITHDRAW) {
                    pubData = Bytes.slice(publicData, offset, Config.FORCE_WITHDRAW_BYTES);
                    Operations.ForceWithdraw memory forceWithdrawReq = Operations.readForceWithdrawPubData(pubData);
                    request = RollupLib.getL1Request(nextCommittedL1RequestId + processedL1RequestNum);
                    if (!RollupLib.isForceWithdrawInL1RequestQueue(forceWithdrawReq, request))
                        revert RequestIsNotExisted(request);
                    ++processedL1RequestNum;
                } else if (opType == Operations.OpType.AUCTION_END) {
                    pubData = Bytes.slice(publicData, offset, Config.AUCTION_END_BYTES);
                } else if (opType == Operations.OpType.WITHDRAW_FEE) {
                    pubData = Bytes.slice(publicData, offset, Config.WITHDRAW_FEE_BYTES);
                } else if (opType == Operations.OpType.EVACUATION) {
                    pubData = Bytes.slice(publicData, offset, Config.EVACUATION_BYTES);
                } else {
                    revert InvalidOpType(opType);
                }
                processableRollupTxHash = keccak256(abi.encodePacked(processableRollupTxHash, pubData));
            }
        }
        return (processableRollupTxHash, processedL1RequestNum, commitmentOffset);
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
        bytes memory pubData = abi.encodePacked(commitmentOffset, newBlock.publicData);
        // newTsRoot is packed in commitment for data availablity and will be proved in the circuit
        return
            sha256(
                abi.encodePacked(
                    previousBlock.stateRoot,
                    newBlock.newStateRoot,
                    newBlock.newTsRoot,
                    newBlock.timestamp,
                    pubData
                )
            );
    }

    /// @notice Internal function to verify one block
    /// @param committedBlock The committed block
    /// @param proof The proof of the block
    function _verifyOneBlock(StoredBlock memory committedBlock, Proof memory proof) internal view {
        if (proof.commitment[0] & Config.INPUT_MASK != uint256(committedBlock.commitment) & Config.INPUT_MASK)
            revert CommitmentInconsistant(proof.commitment[0], uint256(committedBlock.commitment));
        IVerifier verifier = IVerifier(AddressLib.getVerifierAddr());
        if (!verifier.verifyProof(proof.a, proof.b, proof.c, proof.commitment)) revert InvalidProof(proof);
    }

    /// @notice Internal function to add the pending balance of an account
    /// @param accountId The id of the account
    /// @param tokenId The id of the token
    /// @param amount The amount of the token
    function _addPendingBalance(uint32 accountId, uint16 tokenId, uint128 amount) internal {
        address accountAddr = AccountLib.getAccountAddr(accountId);
        Utils.noneZeroAddr(accountAddr);
        AssetConfig memory assetConfig = TokenLib.getAssetConfig(tokenId);
        Utils.noneZeroAddr(assetConfig.tokenAddr);
        bytes22 key = RollupLib.getPendingBalanceKey(accountAddr, tokenId);
        RollupStorage.layout().pendingBalances[key] += amount;
    }

    /// @notice Internal function to update the onchain loan info
    /// @param auctionEnd The auction end request
    function _updateLoan(Operations.AuctionEnd memory auctionEnd) internal {
        Utils.noneZeroAddr(AccountLib.getAccountAddr(auctionEnd.accountId));
        // tsbToken config
        AssetConfig memory assetConfig = TokenLib.getAssetConfig(auctionEnd.tsbTokenId);
        Utils.noneZeroAddr(assetConfig.tokenAddr);
        if (!assetConfig.isTsbToken) revert InvalidTsbTokenAddr(assetConfig.tokenAddr);

        // debt token config
        (address underlyingAsset, uint32 maturityTime) = ITsbToken(assetConfig.tokenAddr).tokenInfo();
        (uint16 debtTokenId, AssetConfig memory underlyingAssetConfig) = TokenLib.getAssetConfig(underlyingAsset);

        // collateral token config
        assetConfig = TokenLib.getAssetConfig(auctionEnd.collateralTokenId);
        Utils.noneZeroAddr(assetConfig.tokenAddr);

        // update loan info
        bytes12 loanId = LoanLib.getLoanId(
            auctionEnd.accountId,
            maturityTime,
            debtTokenId,
            auctionEnd.collateralTokenId
        );
        Loan memory loan = LoanLib.getLoan(loanId);
        loan.accountId = auctionEnd.accountId;
        loan.debtTokenId = debtTokenId;
        loan.collateralTokenId = auctionEnd.collateralTokenId;
        loan.maturityTime = maturityTime;

        // calculate added amount
        uint8 decimals = underlyingAssetConfig.decimals;
        uint128 addedDebtAmt = Utils.toL1Amt(auctionEnd.debtAmt, decimals);
        decimals = assetConfig.decimals;
        uint128 addedCollateralAmt = Utils.toL1Amt(auctionEnd.collateralAmt, decimals);

        loan.debtAmt += addedDebtAmt;
        loan.collateralAmt += addedCollateralAmt;
        LoanStorage.layout().loans[loanId] = loan;

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
        AssetConfig memory assetConfig = TokenLib.getAssetConfig(withdrawFee.tokenId);
        uint128 l1Amt = Utils.toL1Amt(withdrawFee.amount, assetConfig.decimals);
        FundWeight memory fundWeight = ProtocolParamsLib.getFundWeight();
        // insurance
        uint128 amount = (l1Amt * fundWeight.insurance) / Config.FUND_WEIGHT_BASE;
        address toAddr = ProtocolParamsLib.getInsuranceAddr();
        Utils.noneZeroAddr(toAddr);
        Utils.transfer(assetConfig.tokenAddr, payable(toAddr), amount);
        l1Amt -= amount;
        // vault
        amount = (l1Amt * fundWeight.vault) / Config.FUND_WEIGHT_BASE;
        toAddr = ProtocolParamsLib.getVaultAddr();
        Utils.noneZeroAddr(toAddr);
        Utils.transfer(assetConfig.tokenAddr, payable(toAddr), amount);
        l1Amt -= amount;
        // treasury
        toAddr = ProtocolParamsLib.getTreasuryAddr();
        Utils.noneZeroAddr(toAddr);
        Utils.transfer(assetConfig.tokenAddr, payable(toAddr), l1Amt);
    }

    /// @notice Internal function to verify evacuation block
    /// @param commitment The commitment of the block
    /// @param proof The proof of the block
    function _verifyEvacuationBlock(bytes32 commitment, Proof memory proof) internal view {
        if (proof.commitment[0] & Config.INPUT_MASK != uint256(commitment) & Config.INPUT_MASK)
            revert CommitmentInconsistant(proof.commitment[0], uint256(commitment));
        IVerifier verifier = IVerifier(AddressLib.getEvacuVerifierAddr());
        if (!verifier.verifyProof(proof.a, proof.b, proof.c, proof.commitment)) revert InvalidProof(proof);
    }

    /// @notice Internal function to evacuate token to L1
    /// @param evacuation The evacuation request
    function _evacuate(Operations.Evacuation memory evacuation) internal {
        if (RollupLib.isEvacuated(evacuation.accountId, evacuation.tokenId))
            revert Evacuated(evacuation.accountId, evacuation.tokenId);
        address receiver = AccountLib.getAccountAddr(evacuation.accountId);
        Utils.noneZeroAddr(receiver);
        AssetConfig memory assetConfig = TokenLib.getAssetConfig(evacuation.tokenId);
        Utils.noneZeroAddr(assetConfig.tokenAddr);
        uint128 l1Amt = Utils.toL1Amt(evacuation.amount, assetConfig.decimals);
        RollupStorage.layout().evacuated[evacuation.accountId][evacuation.tokenId] = true;
        bytes memory pubData = Operations.encodeEvacuationPubData(evacuation);
        RollupLib.addL1Request(receiver, Operations.OpType.EVACUATION, pubData);
        Utils.transfer(assetConfig.tokenAddr, payable(receiver), l1Amt);

        emit Evacuation(receiver, evacuation.accountId, evacuation.tokenId, l1Amt);
    }

    /// @notice Internal function to check whether the request id is greater than the current request number
    /// @param requestId The id of the request
    /// @return bool Return true is the request id is greater than the current request number, else return false
    function _isRequestIdGtCurRequestNum(uint64 requestId) internal view returns (bool) {
        uint64 curRequestNum = RollupLib.getTotalL1RequestNum();
        return requestId >= curRequestNum;
    }
}
