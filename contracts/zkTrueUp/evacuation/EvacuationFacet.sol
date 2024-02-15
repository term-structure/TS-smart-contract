// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {IEvacuationFacet} from "./IEvacuationFacet.sol";
import {AccountStorage} from "../account/AccountStorage.sol";
import {EvacuationStorage} from "./EvacuationStorage.sol";
import {AddressStorage} from "../address/AddressStorage.sol";
import {TokenStorage, AssetConfig} from "../token/TokenStorage.sol";
import {RollupStorage, StoredBlock, CommitBlock, Proof, Request} from "../rollup/RollupStorage.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {EvacuationLib} from "./EvacuationLib.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {Operations} from "../libraries/Operations.sol";
import {Config} from "../libraries/Config.sol";
import {Utils} from "../libraries/Utils.sol";

/**
 * @title Term Structure Evacuation Facet Contract
 * @author Term Structure Labs
 * @notice The EvacuationFacet contract is used to handle the evacuation-related functions
 */
contract EvacuationFacet is IEvacuationFacet, ReentrancyGuard {
    using EvacuationLib for EvacuationStorage.Layout;
    using AddressLib for AddressStorage.Layout;
    using AccountLib for AccountStorage.Layout;
    using TokenLib for TokenStorage.Layout;
    using Operations for bytes;
    using RollupLib for *;
    using Utils for *;

    /* ============ External Functions ============ */

    /**
     * @inheritdoc IEvacuationFacet
     * @notice The evacuation mode will be activated when the current block timestamp
     *      is greater than the expiration block timestamp of the last executed L1 request
     * @notice When the evacuation mode is activated, the block state will be rolled back to the last executed block
     *      and the request state will be rolled back to the last executed request
     * @notice The remaining non-executed L1 requests will be consumed by the consumeL1RequestInEvacuMode function
     *      with their public data, after consume all non-executed request, user can start to evacuate their funds
     */
    function activateEvacuation() external {
        EvacuationStorage.Layout storage esl = EvacuationStorage.layout();
        esl.requireActive();

        RollupStorage.Layout storage rsl = RollupStorage.layout();
        uint64 executedL1RequestNum = rsl.getExecutedL1RequestNum();
        uint64 lastExecutedL1RequestId = executedL1RequestNum - 1;
        uint32 expirationTime = rsl.getL1Request(lastExecutedL1RequestId).expirationTime;
        // solhint-disable-next-line not-rely-on-time
        if (block.timestamp > expirationTime && expirationTime != 0) {
            // Roll back state
            uint32 executedBlockNum = rsl.getExecutedBlockNum();
            rsl.committedBlockNum = executedBlockNum;
            rsl.verifiedBlockNum = executedBlockNum;
            rsl.committedL1RequestNum = executedL1RequestNum;

            esl.evacuMode = true;
            emit EvacuModeActivation();
        } else {
            // solhint-disable-next-line not-rely-on-time
            revert TimeStampIsNotExpired(block.timestamp, expirationTime);
        }
    }

    /**
     * @inheritdoc IEvacuationFacet
     * @notice The function only can be called in evacuation mode
     * @notice Consume the non-executed L1 requests with their public data
     */
    function consumeL1RequestInEvacuMode(bytes[] calldata consumedTxPubData) external {
        EvacuationStorage.Layout storage esl = EvacuationStorage.layout();
        esl.requireEvacuMode();

        RollupStorage.Layout storage rsl = RollupStorage.layout();
        uint64 totalL1RequestNum = rsl.getTotalL1RequestNum();
        uint64 lastL1RequestId = totalL1RequestNum - 1;
        // The last L1 request cannot be evacuation
        // because the evacuate action can only be called after consumed all L1 non-executed request
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
                // refund the deposit amount to the pending balance for withdraw
                Operations.Deposit memory depositReq = pubData.readDepositPubData();
                rsl.addPendingBalance(depositReq.accountId, depositReq.tokenId, depositReq.amount);
            } else if (opType == Operations.OpType.REGISTER) {
                // de-register only remove the accountAddr mapping to accountId,
                // which use to check in AccountLib.getValidAccount and let user can register again
                // and still can add pending balance to this register account
                // when consume the deposit request in the next request
                Operations.Register memory registerReq = pubData.readRegisterPubData();
                AccountStorage.Layout storage asl = AccountStorage.layout();
                address registerAddr = asl.accountAddresses[registerReq.accountId];
                delete asl.accountIds[registerAddr];
                emit AccountDeregistered(registerAddr, registerReq.accountId);
            }

            ++executedL1RequestNum;
            emit L1RequestConsumed(executedL1RequestNum, opType, pubData);
        }
        rsl.committedL1RequestNum = executedL1RequestNum;
        rsl.executedL1RequestNum = executedL1RequestNum;
    }

    /**
     * @inheritdoc IEvacuationFacet
     * @notice The function only can be called in evacuation mode and after consume all non-executed L1 requests
     * @notice The newBlock is a pseudo block, it only for create the block commitment and not commit to the state
     * @notice The evacuate fuction will not commit a new state root to make all the users evacuate their funds from the same state
     */
    function evacuate(
        StoredBlock calldata lastExecutedBlock,
        CommitBlock calldata newBlock,
        Proof calldata proof
    ) external nonReentrant {
        EvacuationStorage.Layout storage esl = EvacuationStorage.layout();
        esl.requireEvacuMode();

        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.requireConsumedAllNonExecutedReq();

        rsl.requireBlockHashIsEq(rsl.getExecutedBlockNum(), lastExecutedBlock);
        newBlock.blockNumber.requireValidBlockNum(lastExecutedBlock.blockNumber);
        newBlock.timestamp.requireValidBlockTimestamp(lastExecutedBlock.timestamp);

        bytes calldata publicData = newBlock.publicData;
        // evacuation public data length is 2 chunks
        if (publicData.length != Config.BYTES_OF_TWO_CHUNKS) revert InvalidEvacuatePubDataLength(publicData.length);

        bytes32 commitment = RollupLib.calcBlockCommitment(
            lastExecutedBlock,
            newBlock,
            Config.EVACUATION_COMMITMENT_OFFSET
        );

        RollupLib.verifyOneBlock(commitment, proof, AddressStorage.layout().getEvacuVerifier());

        Operations.Evacuation memory evacuation = Operations.readEvacuationPubdata(publicData);
        _evacuate(esl, rsl, evacuation);
    }

    /**
     * @inheritdoc IEvacuationFacet
     * @notice The function is to refund the pending balance for the account which is deregistered in `consumeL1RequestInEvacuMode`
     * @notice The function is only refund for the deregistered account, the normal account should use the `withdraw` function to withdraw their funds
     * @notice De-register only remove the accountAddr mapping to accountId, and keep the accountId mapping to accountAddr for refund
               so if the `asl.getAccountId(asl.getAccountAddr(accountId)) == accountId` means the account is not the deregistered account
     */
    function refundDeregisteredAddr(IERC20 token, uint256 amount, uint32 accountId) external nonReentrant {
        AccountStorage.Layout storage asl = AccountStorage.layout();
        address accountAddr = asl.getAccountAddr(accountId);
        // check the account is deregistered (accountAddr mapping to accountId is deleted)
        if (asl.getAccountId(accountAddr) == accountId) revert NotDeregisteredAddr(accountAddr, accountId);
        if (accountAddr != msg.sender) revert AccountAddrIsNotCaller(accountAddr, msg.sender);

        TokenStorage.Layout storage tsl = TokenStorage.layout();
        (uint16 tokenId, AssetConfig memory assetConfig) = tsl.getValidToken(token);

        RollupStorage.Layout storage rsl = RollupStorage.layout();
        AccountLib.updateWithdrawalRecord(rsl, msg.sender, accountAddr, accountId, token, tokenId, amount);

        Utils.tokenTransfer(token, payable(accountAddr), amount, assetConfig.isTsbToken);
    }

    /* ============ External View Functions ============ */

    /**
     * @inheritdoc IEvacuationFacet
     */
    function isEvacuMode() external view returns (bool) {
        return EvacuationStorage.layout().isEvacuMode();
    }

    /**
     * @inheritdoc IEvacuationFacet
     */
    function isEvacuted(address addr, uint16 tokenId) external view returns (bool) {
        uint32 accountId = AccountStorage.layout().getAccountId(addr);
        return EvacuationStorage.layout().isEvacuated(accountId, tokenId);
    }

    /* ============ Internal Functions ============ */

    /// @notice Internal function to check whether the chunk id delta is valid when commit evacuation block
    /// @dev The evacuation block only includes the evacuation request or noop,
    ///      so the first chunk id delta should be 0 and the remaining chunk id delta should be evacuation chunk size
    /// @param chunkIdDeltas The chunk id delta array
    function _requireValidEvacuBlockChunkIdDelta(uint16[] calldata chunkIdDeltas) internal pure {
        uint256 chunkIdDeltaLength = chunkIdDeltas.length;

        // If there are chunk ID deltas and the first one is not 0, revert
        if (chunkIdDeltaLength != 0 && chunkIdDeltas[0] != 0) revert InvalidChunkIdDelta(chunkIdDeltas);

        // check every chunk id delta (not include the first one) ) is equal to evacuation chunk size
        uint256 andDeltas = Config.EVACUATION_CHUNK_SIZE;
        uint256 orDeltas = Config.EVACUATION_CHUNK_SIZE;
        for (uint256 i = 1; i < chunkIdDeltaLength; ++i) {
            uint16 chunkIdDelta = chunkIdDeltas[i];
            andDeltas &= chunkIdDelta;
            orDeltas |= chunkIdDelta;
        }

        // If there is inconsistency in delta values, revert
        // This will occur if at least one chunk ID delta is not equal to the size of an evacuation chunk
        if (andDeltas != orDeltas) revert InvalidChunkIdDelta(chunkIdDeltas);
    }

    /// @notice Internal function to evacuate token to L1
    /// @param esl The evacuation storage layout
    /// @param rsl The rollup storage layout
    /// @param evacuation The evacuation request
    function _evacuate(
        EvacuationStorage.Layout storage esl,
        RollupStorage.Layout storage rsl,
        Operations.Evacuation memory evacuation
    ) internal {
        uint32 accountId = evacuation.accountId;
        uint16 tokenId = evacuation.tokenId;
        if (esl.isEvacuated(accountId, tokenId)) revert Evacuated(accountId, tokenId);

        address receiver = AccountStorage.layout().getAccountAddr(accountId);
        Utils.notZeroAddr(receiver);

        AssetConfig memory assetConfig = TokenStorage.layout().getAssetConfig(tokenId);
        IERC20 token = assetConfig.token;
        Utils.notZeroAddr(address(token));

        esl.evacuated[accountId][tokenId] = true;

        bytes memory pubData = Operations.encodeEvacuationPubData(evacuation);
        rsl.addL1Request(receiver, Operations.OpType.EVACUATION, pubData);

        uint256 l1Amt = evacuation.amount.toL1Amt(assetConfig.decimals);
        Utils.tokenTransfer(token, payable(receiver), l1Amt, assetConfig.isTsbToken);

        emit Evacuation(receiver, accountId, token, tokenId, l1Amt);
    }
}
