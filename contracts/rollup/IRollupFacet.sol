// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {RollupStorage, CommitBlock, StoredBlock, ExecuteBlock, Proof, L1Request} from "./RollupStorage.sol";
import {Operations} from "../libraries/Operations.sol";

interface IRollupFacet {
    /// @notice Error for invalid last committed block
    error InvalidLastCommittedBlock(StoredBlock lastCommittedBlock);
    /// @notice Error for invalid last executed block
    error InvalidLastExecutedBlock(StoredBlock lastExecutedBlock);
    /// @notice Error for committed request number exceed total request number
    error CommittedRequestNumExceedTotalNum(uint64 committedL1RequestNum);
    /// @notice Error for invalid committed block
    error InvalidCommittedBlock(StoredBlock committedBlocks);
    /// @notice Error for verified block number exceed committed block number
    error VerifiedBlockNumExceedCommittedNum(uint32 verifiedBlockNum);
    /// @notice Error for executed block number exceed proved block number
    error ExecutedBlockNumExceedProvedNum(uint32 executedBlockNum);
    /// @notice Error for new block timestamp is less than previous block timestamp
    error TimestampLtPrevious(uint256 newBlockTimestamp, uint256 previousBlockTimestamp);
    /// @notice Error for invalid block number
    error InvalidBlockNum(uint32 newBlockNum);
    /// @notice Error for operation type is not matched
    error OpTypeIsNotMatched(Operations.OpType requestOpType, Operations.OpType expectedOpType);
    /// @notice Error for request is not existed
    error RequestIsNotExisted(L1Request request);
    /// @notice Error for invalid invalid public data length
    error InvalidPubDataLength(uint256 pubDataLength);
    /// @notice Error for offset is greater than public data length
    error OffsetGtPubDataLength(uint256 offset);
    /// @notice Error for invalid offset
    error InvalidOffset(uint256 offset);
    /// @notice Error for offset is already set
    error OffsetIsSet(uint256 chunkId);
    /// @notice Error for base token address is not matched
    error BaseTokenAddrIsNotMatched();
    /// @notice Error for maturity time is not matched
    error MaturityTimeIsNotMatched();
    /// @notice Error for invalid op type
    error InvalidOpType(Operations.OpType opType);
    /// @notice Error for inconsistent commitment
    error CommitmentInconsistant(uint256 proofCommitment, uint256 committedBlockcommitment);
    /// @notice Error for invalid proof
    error InvalidProof(Proof proof);
    /// @notice Error for executed block
    error InvalidExecutedBlock(ExecuteBlock executeBlock);
    /// @notice Error for invalid executed block number
    error InvalidExecutedBlockNum(uint32 executedBlockNum);
    /// @notice Error for redeem with invalid tsb token address
    error InvalidTsbTokenAddr(address invalidTokenAddr);
    /// @notice Error for pending rollup tx hash is not matched
    error PendingRollupTxHashIsNotMatched();
    /// @notice Error for the specified accountId and tokenId is already evacuated
    error Evacuated(uint32 accountId, uint16 tokenId);

    /// @notice Emit when there is a new block committed
    /// @param blockNumber The number of the committed block
    /// @param commitment The commitment of the block
    event BlockCommitted(uint32 blockNumber, bytes32 commitment);

    /// @notice Emit when there is a new block verified
    /// @param blockNumber The number of the verified block
    event BlockVerified(uint32 blockNumber);

    /// @notice Emit when there is a new block executed
    /// @param blockNumber The number of the executed block
    event BlockExecuted(uint32 blockNumber);

    /// @notice Emit when there is a new block reverted
    /// @param blockNumber The number of the reverted block
    event BlockReverted(uint32 blockNumber);

    /// @notice Emit when there is an evacuation
    /// @param accountAddr The address of the account
    /// @param accountId The id of the account
    /// @param tokenId The id of the token
    /// @param amount The amount of the token
    event Evacuation(address indexed accountAddr, uint32 accountId, uint16 tokenId, uint128 amount);

    /// @notice Emitted when evacuation is activated
    /// @param evacuationBlock The block number when evacuation is activated
    event EvacuationActivated(uint256 indexed evacuationBlock);

    /// @notice Emit when there is a new loan created
    /// @param loanId The id of the loan
    /// @param accountId The account id of the loan owner
    /// @param maturityTime The maturity time of the loan
    /// @param debtTokenId The id of the debt token
    /// @param collateralTokenId The id of the collateral token
    /// @param debtAmt The amount of the debt
    /// @param collateralAmt The amount of the collateral
    event UpdateLoan(
        bytes12 indexed loanId,
        uint32 indexed accountId,
        uint32 maturityTime,
        uint16 debtTokenId,
        uint16 collateralTokenId,
        uint128 debtAmt,
        uint128 collateralAmt
    );

    /// @notice Commit blocks
    /// @param lastCommittedBlock The last committed block
    /// @param newBlocks The new blocks to be committed
    function commitBlocks(StoredBlock memory lastCommittedBlock, CommitBlock[] memory newBlocks) external;

    /// @notice Verify blocks
    /// @param committedBlocks The committed blocks to be verified
    /// @param proof The proof of the committed blocks
    function verifyBlocks(StoredBlock[] memory committedBlocks, Proof[] memory proof) external;

    /// @notice Execute blocks
    /// @param pendingBlocks The pending blocks to be executed
    function executeBlocks(ExecuteBlock[] memory pendingBlocks) external;

    /// @notice Revert blocks
    /// @param revertedBlocks The blocks to be reverted
    function revertBlocks(StoredBlock[] memory revertedBlocks) external;

    /// @notice Evacuate the funds of a specified user and token in the evacuMode
    /// @dev The evacuate fuction will not commit a new state root to make all the users evacuate their funds from the same state
    /// @param lastExecutedBlock The last executed block
    /// @param newBlock The new block to be committed with the evacuation operation
    /// @param proof The proof of the new block
    function evacuate(StoredBlock memory lastExecutedBlock, CommitBlock memory newBlock, Proof memory proof) external;

    /// @notice When L2 system is down, anyone can call this function to activate the evacuation mode
    /// @dev The evacuation mode will be activated when the current block number is greater than the expiration block number of the first pending L1 request
    function activateEvacuation() external;

    /// @notice Return the evacuation mode is activated or not
    /// @return evacuMode The evacuation mode status
    function isEvacuMode() external view returns (bool);

    /// @notice Return the L1 request of the specified id
    /// @param requestId The id of the specified request
    /// @return request The request of the specified id
    function getL1Request(uint64 requestId) external view returns (L1Request memory);

    /// @notice Return the L1 request number
    /// @return committedL1RequestNum The number of committed L1 requests
    /// @return executedL1RequestNum The number of executed L1 requests
    /// @return totalL1RequestNum The total number of L1 requests
    function getL1RequestNum() external view returns (uint64, uint64, uint64);

    /// @notice Return the block number
    /// @return committedBlockNum The number of committed blocks
    /// @return verifiedBlockNum The number of verified blocks
    /// @return executedBlockNum The number of executed blocks
    function getBlockNum() external view returns (uint32, uint32, uint32);

    function getStoredBlockHash(uint32 blockNum) external view returns (bytes32);

    /// @notice Return the pending balance of the specified account and token
    /// @param accountAddr The address of the account
    /// @param tokenAddr The address of the token
    /// @return pendingBalance The pending balance of the specified account and token
    function getPendingBalances(address accountAddr, address tokenAddr) external view returns (uint128);
}
