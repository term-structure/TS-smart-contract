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
            lastCommittedBlock = _commitOneBlock(lastCommittedBlock, newBlocks[i], committedL1RequestNum);
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

            _verifyOneBlock(verifyingBlock.storedBlock.commitment, verifyingBlock.proof);
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
        uint32 blockNum = uint32(pendingBlocks.length);
        uint32 executedBlockNum = rsl.getExecutedBlockNum();
        for (uint32 i; i < blockNum; ++i) {
            _executeOneBlock(rsl, pendingBlocks[i], i);
            rsl.executedL1RequestNum += pendingBlocks[i].storedBlock.l1RequestNum;
            emit BlockExecuted(pendingBlocks[i].storedBlock.blockNumber);
        }
        executedBlockNum += blockNum;
        if (executedBlockNum > rsl.getVerifiedBlockNum()) revert ExecutedBlockNumExceedProvedNum(executedBlockNum);
        rsl.executedBlockNum = executedBlockNum;
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

        bytes memory commitmentOffset = new bytes(2);
        commitmentOffset[0] = 0x01;
        commitmentOffset[1] = 0x00;
        bytes32 commitment = _createBlockCommitment(lastExecutedBlock, newBlock, commitmentOffset);

        // Verify the new block
        _verifyEvacuationBlock(commitment, proof);
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
        RollupStorage.Layout storage rsl = RollupStorage.layout();
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
        RollupStorage.Layout storage rsl = RollupStorage.layout();
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
        RollupStorage.Layout storage rsl = RollupStorage.layout();
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
        return RollupLib.getRollupStorage().getStoredBlockHash(blockNum);
    }

    /**
     * @inheritdoc IRollupFacet
     */
    function getPendingBalances(address accountAddr, address tokenAddr) external view returns (uint128) {
        uint16 tokenId = TokenLib.getTokenStorage().getTokenId(tokenAddr);
        bytes22 key = RollupLib.getPendingBalanceKey(accountAddr, tokenId);
        return RollupLib.getRollupStorage().getPendingBalances(key);
    }

    /// @notice Internal function to commit one block
    /// @param previousBlock The previous block
    /// @param newBlock The new block to be committed
    /// @param committedL1RequestNum The committed L1 request number
    /// @return storedBlock The committed block
    function _commitOneBlock(
        StoredBlock memory previousBlock,
        CommitBlock memory newBlock,
        uint64 committedL1RequestNum
    ) internal view returns (StoredBlock memory) {
        if (newBlock.timestamp < previousBlock.timestamp)
            revert TimestampLtPrevious(newBlock.timestamp, previousBlock.timestamp);
        if (newBlock.blockNumber != previousBlock.blockNumber + 1) revert InvalidBlockNum(newBlock.blockNumber);

        (
            bytes32 pendingRollupTxHash,
            uint64 processedL1RequestNum,
            bytes memory commitmentOffset
        ) = _collectRollupRequests(newBlock, committedL1RequestNum);

        bytes32 commitment = _createBlockCommitment(previousBlock, newBlock, commitmentOffset);

        return
            StoredBlock({
                blockNumber: newBlock.blockNumber,
                l1RequestNum: processedL1RequestNum,
                pendingRollupTxHash: pendingRollupTxHash,
                commitment: commitment,
                stateRoot: newBlock.newStateRoot,
                timestamp: newBlock.timestamp
            });
    }

    /// @notice Internal function to execute one block
    /// @param rsl The rollup storage layout
    /// @param executeBlock The block to be executed
    /// @param blockNum The block number to be executed
    function _executeOneBlock(
        RollupStorage.Layout storage rsl,
        ExecuteBlock memory executeBlock,
        uint32 blockNum
    ) internal {
        if (
            keccak256(abi.encode(executeBlock.storedBlock)) !=
            rsl.getStoredBlockHash(executeBlock.storedBlock.blockNumber)
        ) revert InvalidExecutedBlock(executeBlock);
        if (executeBlock.storedBlock.blockNumber != rsl.getExecutedBlockNum() + blockNum + 1)
            revert InvalidExecutedBlockNum(executeBlock.storedBlock.blockNumber);

        bytes32 pendingRollupTxHash = Config.EMPTY_STRING_KECCAK;
        for (uint32 i; i < executeBlock.pendingRollupTxPubData.length; ++i) {
            bytes memory pubData = executeBlock.pendingRollupTxPubData[i];
            uint8 decimals;
            uint128 amount;
            Operations.OpType opType = Operations.OpType(uint8(pubData[0]));
            TokenStorage.Layout storage tsl = TokenStorage.layout();
            if (opType == Operations.OpType.WITHDRAW) {
                Operations.Withdraw memory withdrawReq = Operations.readWithdrawPubData(pubData);
                decimals = tsl.getAssetConfig(withdrawReq.tokenId).decimals;
                amount = Utils.toL1Amt(withdrawReq.amount, decimals);
                _addPendingBalance(rsl, tsl, withdrawReq.accountId, withdrawReq.tokenId, amount);
            } else if (opType == Operations.OpType.FORCE_WITHDRAW) {
                Operations.ForceWithdraw memory forceWithdrawReq = Operations.readForceWithdrawPubData(pubData);
                decimals = tsl.getAssetConfig(forceWithdrawReq.tokenId).decimals;
                amount = Utils.toL1Amt(forceWithdrawReq.amount, decimals);
                _addPendingBalance(rsl, tsl, forceWithdrawReq.accountId, forceWithdrawReq.tokenId, amount);
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
            pendingRollupTxHash = keccak256(abi.encodePacked(pendingRollupTxHash, pubData));
        }

        if (pendingRollupTxHash != executeBlock.storedBlock.pendingRollupTxHash)
            revert PendingRollupTxHashIsNotMatched();
    }

    /// @notice Internal function to collect and check the rollup requests
    /// @param newBlock The new block to be committed
    /// @param committedL1RequestNum The committed L1 request number
    /// @return processableRollupTxHash The hash of the rollup txs to be processed
    /// @return nextCommittedL1RequestId The next committed L1 request ID
    /// @return commitmentOffset The offset of the commitment
    function _collectRollupRequests(
        CommitBlock memory newBlock,
        uint64 committedL1RequestNum
    ) internal view returns (bytes32, uint64, bytes memory) {
        bytes memory publicData = newBlock.publicData;
        if (publicData.length % Config.CHUNK_BYTES != 0) revert InvalidPubDataLength(publicData.length);
        bytes32 processableRollupTxHash = Config.EMPTY_STRING_KECCAK;
        bytes memory commitmentOffset = new bytes(publicData.length / Config.CHUNK_BYTES);
        uint64 processedL1RequestNum;
        uint256 offset;
        L1Request memory request;
        bytes memory data;
        for (uint256 i; i < newBlock.publicDataOffsets.length; i++) {
            offset = newBlock.publicDataOffsets[i];
            if (offset >= publicData.length) revert OffsetGtPubDataLength(offset);
            if (offset % Config.CHUNK_BYTES != 0) revert InvalidOffset(offset);
            {
                uint256 chunkId = offset / Config.CHUNK_BYTES;
                if (commitmentOffset[chunkId] != bytes1(0x00)) revert OffsetIsSet(chunkId);
                commitmentOffset[chunkId] = bytes1(0x01);
            }
            Operations.OpType opType = Operations.OpType(uint8(publicData[offset]));
            if (opType == Operations.OpType.REGISTER) {
                data = Bytes.sliceRegisterData(publicData, offset);
                Operations.Register memory register = Operations.readRegisterPubData(data);
                request = RollupLib.getRollupStorage().getL1Request(committedL1RequestNum + processedL1RequestNum);
                if (!RollupLib.isRegisterInL1RequestQueue(register, request)) revert RequestIsNotExisted(request);
                ++processedL1RequestNum;
            } else if (opType == Operations.OpType.DEPOSIT) {
                data = Bytes.sliceDepositData(publicData, offset);
                Operations.Deposit memory deposit = Operations.readDepositPubData(data);
                request = RollupLib.getRollupStorage().getL1Request(committedL1RequestNum + processedL1RequestNum);
                if (!RollupLib.isDepositInL1RequestQueue(deposit, request)) revert RequestIsNotExisted(request);
                ++processedL1RequestNum;
            } else if (opType == Operations.OpType.CREATE_TSB_TOKEN) {
                data = Bytes.sliceCreateTsbTokenData(publicData, offset);
                Operations.CreateTsbToken memory createTsbTokenReq = Operations.readCreateTsbTokenPubData(data);
                TokenStorage.Layout storage tsl = TokenStorage.layout();
                AssetConfig memory tsbTokenConfig = tsl.getAssetConfig(createTsbTokenReq.tsbTokenId);
                AssetConfig memory baseTokenConfig = tsl.getAssetConfig(createTsbTokenReq.baseTokenId);
                (address underlyingAsset, uint32 maturityTime) = ITsbToken(tsbTokenConfig.tokenAddr).tokenInfo();
                if (underlyingAsset != baseTokenConfig.tokenAddr) revert BaseTokenAddrIsNotMatched();
                if (maturityTime != createTsbTokenReq.maturityTime) revert MaturityTimeIsNotMatched();
            } else if (opType == Operations.OpType.EVACUATION) {
                data = Bytes.sliceEvacuationData(publicData, offset);
                Operations.Evacuation memory evacuation = Operations.readEvacuationPubdata(data);
                request = RollupLib.getRollupStorage().getL1Request(committedL1RequestNum + processedL1RequestNum);
                if (!RollupLib.isEvacuationInL1RequestQueue(evacuation, request)) revert RequestIsNotExisted(request);
                ++processedL1RequestNum;
            } else {
                if (opType == Operations.OpType.WITHDRAW) {
                    data = Bytes.sliceWithdrawData(publicData, offset);
                } else if (opType == Operations.OpType.FORCE_WITHDRAW) {
                    data = Bytes.sliceForceWithdrawData(publicData, offset);
                    Operations.ForceWithdraw memory forceWithdrawReq = Operations.readForceWithdrawPubData(data);
                    request = RollupLib.getRollupStorage().getL1Request(committedL1RequestNum + processedL1RequestNum);
                    if (!RollupLib.isForceWithdrawInL1RequestQueue(forceWithdrawReq, request))
                        revert RequestIsNotExisted(request);
                    ++processedL1RequestNum;
                } else if (opType == Operations.OpType.AUCTION_END) {
                    data = Bytes.sliceAuctionEndData(publicData, offset);
                } else if (opType == Operations.OpType.WITHDRAW_FEE) {
                    data = Bytes.sliceWithdrawFeeData(publicData, offset);
                } else {
                    revert InvalidOpType(opType);
                }
                processableRollupTxHash = keccak256(abi.encodePacked(processableRollupTxHash, data));
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
    /// @param commitment The commitment of the block
    /// @param proof The proof of the block
    function _verifyOneBlock(bytes32 commitment, Proof memory proof) internal view {
        if (proof.commitment[0] & Config.INPUT_MASK != uint256(commitment) & Config.INPUT_MASK)
            revert CommitmentInconsistant(proof.commitment[0], uint256(commitment));
        IVerifier verifier = IVerifier(AddressLib.getAddressStorage().getVerifierAddr());
        if (!verifier.verifyProof(proof.a, proof.b, proof.c, proof.commitment)) revert InvalidProof(proof);
    }

    /// @notice Internal function to add the pending balance of an account
    /// @param rsl The rollup storage
    /// @param tsl The token storage
    /// @param accountId The id of the account
    /// @param tokenId The id of the token
    /// @param amount The amount of the token
    function _addPendingBalance(
        RollupStorage.Layout storage rsl,
        TokenStorage.Layout storage tsl,
        uint32 accountId,
        uint16 tokenId,
        uint128 amount
    ) internal {
        address accountAddr = AccountLib.getAccountStorage().getAccountAddr(accountId);
        Utils.noneZeroAddr(accountAddr);

        AssetConfig memory assetConfig = tsl.getAssetConfig(tokenId);
        Utils.noneZeroAddr(assetConfig.tokenAddr);

        bytes22 key = RollupLib.getPendingBalanceKey(accountAddr, tokenId);
        rsl.pendingBalances[key] += amount;
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
        uint128 addedDebtAmt = Utils.toL1Amt(auctionEnd.debtAmt, decimals);
        decimals = assetConfig.decimals;
        uint128 addedCollateralAmt = Utils.toL1Amt(auctionEnd.collateralAmt, decimals);

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
        uint128 l1Amt = Utils.toL1Amt(withdrawFee.amount, assetConfig.decimals);
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

    /// @notice Internal function to verify evacuation block
    /// @param commitment The commitment of the block
    /// @param proof The proof of the block
    function _verifyEvacuationBlock(bytes32 commitment, Proof memory proof) internal view {
        if (proof.commitment[0] & Config.INPUT_MASK != uint256(commitment) & Config.INPUT_MASK)
            revert CommitmentInconsistant(proof.commitment[0], uint256(commitment));
        IVerifier verifier = IVerifier(AddressLib.getAddressStorage().getEvacuVerifierAddr());
        if (!verifier.verifyProof(proof.a, proof.b, proof.c, proof.commitment)) revert InvalidProof(proof);
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
        uint128 l1Amt = Utils.toL1Amt(evacuation.amount, assetConfig.decimals);
        rsl.evacuated[evacuation.accountId][evacuation.tokenId] = true;
        bytes memory pubData = Operations.encodeEvacuationPubData(evacuation);
        rsl.addL1Request(receiver, Operations.OpType.EVACUATION, pubData);
        Utils.transfer(assetConfig.tokenAddr, payable(receiver), l1Amt);

        emit Evacuation(receiver, evacuation.accountId, assetConfig.tokenAddr, evacuation.tokenId, l1Amt);
    }
}
