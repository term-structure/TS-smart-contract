// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RollupStorage, Proof, CommitBlock, StoredBlock, VerifyBlock, ExecuteBlock, L1Request} from "./RollupStorage.sol";
import {Operations} from "../libraries/Operations.sol";

/**
 * @title Term Structure Rollup Facet Interface
 * @author Term Structure Labs
 */
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
    /// @notice Error for maturity time is not matched
    error MaturityTimeIsNotMatched(uint32 tsbTokenMaturityTime, uint32 createTsbReqMaturityTime);
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
    error PendingRollupTxHashIsNotMatched(bytes32 pendingRollupTxHash, bytes32 executeBlockPendingRollupTxHash);
    /// @notice Error for the specified accountId and tokenId is already evacuated
    error Evacuated(uint32 accountId, uint16 tokenId);
    /// @notice Error for the system is not in evacuation mode
    error NotEvacuMode();
    /// @notice Error for activate evacuation mode, but the timestamp is not expired
    error TimeStampIsNotExpired(uint256 curtimestamp, uint256 expirationTime);
    /// @notice Error for underlyingAsset token and base token is not matched
    error TokenIsNotMatched(IERC20 underlyingAsset, IERC20 baseToken);

    /// @notice Emit when there is a new block committed
    /// @param blockNumber The number of the committed block
    /// @param commitment The commitment of the block
    event BlockCommit(uint32 indexed blockNumber, bytes32 indexed commitment);

    /// @notice Emit when there is a new block verified
    /// @param blockNumber The number of the verified block
    event BlockVerification(uint32 indexed blockNumber);

    /// @notice Emit when there is a new block executed
    /// @param blockNumber The number of the executed block
    event BlockExecution(uint32 indexed blockNumber);

    /// @notice Emit when there is a new block reverted
    /// @param blockNumber The number of the reverted block
    event BlockRevert(uint32 indexed blockNumber);

    /// @notice Emit when there is an evacuation
    /// @param accountAddr The address of the account
    /// @param accountId The id of the account
    /// @param token The token to be evacuated
    /// @param tokenId The id of the token
    /// @param amount The amount of the token
    event Evacuation(
        address indexed accountAddr,
        uint32 indexed accountId,
        IERC20 token,
        uint16 tokenId,
        uint256 amount
    );

    /// @notice Emitted when evacuation is activated
    event EvacuationActivation();

    /// @notice Emit when there is a new loan created
    /// @param loanId The id of the loan
    /// @param accountId The account id of the loan owner
    /// @param addedCollateralAmt  The added collateral amount of the loan
    /// @param addedDebtAmt The added debt amount of the loan
    event UpdateLoan(
        bytes12 indexed loanId,
        uint32 indexed accountId,
        uint128 addedCollateralAmt,
        uint128 addedDebtAmt
    );

    /// @notice Commit blocks
    /// @param lastCommittedBlock The last committed block
    /// @param newBlocks The new blocks to be committed
    function commitBlocks(StoredBlock memory lastCommittedBlock, CommitBlock[] memory newBlocks) external;

    /// @notice Verify blocks
    /// @param verifyingBlocks The committed blocks to be verified and proofs
    function verifyBlocks(VerifyBlock[] memory verifyingBlocks) external;

    /// @notice Execute blocks
    /// @param pendingBlocks The pending blocks to be executed
    function executeBlocks(ExecuteBlock[] memory pendingBlocks) external;

    /// @notice Revert blocks
    /// @param revertedBlocks The blocks to be reverted
    function revertBlocks(StoredBlock[] memory revertedBlocks) external;

    /// @notice Evacuate the funds of a specified user and token in the evacuMode
    /// @param lastExecutedBlock The last executed block
    /// @param newBlock The new block to be committed with the evacuation operation
    /// @param proof The proof of the new block
    function evacuate(StoredBlock memory lastExecutedBlock, CommitBlock memory newBlock, Proof memory proof) external;

    /// @notice When L2 system is down, anyone can call this function to activate the evacuation mode
    function activateEvacuation() external;

    /// @notice Return the evacuation mode is activated or not
    /// @return evacuMode The evacuation mode status
    function isEvacuMode() external view returns (bool evacuMode);

    /// @notice Check whether the register request is in the L1 request queue
    /// @param register The register request
    /// @param requestId The id of the request
    /// @return isExisted Return true is the request is existed in the L1 request queue, else return false
    function isRegisterInL1RequestQueue(
        Operations.Register memory register,
        uint64 requestId
    ) external view returns (bool isExisted);

    /// @notice Check whether the deposit request is in the L1 request queue
    /// @param deposit The deposit request
    /// @param requestId The id of the request
    /// @return isExisted Return true is the request is existed in the L1 request queue, else return false
    function isDepositInL1RequestQueue(
        Operations.Deposit memory deposit,
        uint64 requestId
    ) external view returns (bool isExisted);

    /// @notice Check whether the force withdraw request is in the L1 request queue
    /// @param forceWithdraw The force withdraw request
    /// @param requestId The id of the request
    /// @return isExisted Return true is the request is existed in the L1 request queue, else return false
    function isForceWithdrawInL1RequestQueue(
        Operations.ForceWithdraw memory forceWithdraw,
        uint64 requestId
    ) external view returns (bool isExisted);

    /// @notice Return the L1 request of the specified id
    /// @param requestId The id of the specified request
    /// @return l1Request The request of the specified id
    function getL1Request(uint64 requestId) external view returns (L1Request memory l1Request);

    /// @notice Return the L1 request number
    /// @return committedL1RequestNum The number of committed L1 requests
    /// @return executedL1RequestNum The number of executed L1 requests
    /// @return totalL1RequestNum The total number of L1 requests
    function getL1RequestNum()
        external
        view
        returns (uint64 committedL1RequestNum, uint64 executedL1RequestNum, uint64 totalL1RequestNum);

    /// @notice Return the block number
    /// @return committedBlockNum The number of committed blocks
    /// @return verifiedBlockNum The number of verified blocks
    /// @return executedBlockNum The number of executed blocks
    function getBlockNum()
        external
        view
        returns (uint32 committedBlockNum, uint32 verifiedBlockNum, uint32 executedBlockNum);

    /// @notice Return the block hash of the specified block number
    /// @param blockNum The number of the specified block
    /// @return blockHash The block hash of the specified block number
    function getStoredBlockHash(uint32 blockNum) external view returns (bytes32 blockHash);

    /// @notice Return the pending balance of the specified account and token
    /// @param accountAddr The address of the account
    /// @param token The token to be checked
    /// @return pendingBalance The pending balance of the specified account and token
    function getPendingBalances(address accountAddr, IERC20 token) external view returns (uint256 pendingBalance);
}
