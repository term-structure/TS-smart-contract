// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RollupStorage, Proof, CommitBlock, StoredBlock, VerifyBlock, ExecuteBlock, Request} from "./RollupStorage.sol";
import {Operations} from "../libraries/Operations.sol";

/**
 * @title Term Structure Rollup Facet Interface
 * @author Term Structure Labs
 */
interface IRollupFacet {
    /// @notice Error for committed request number exceed total request number
    error CommittedRequestNumExceedTotalNum(uint64 committedL1RequestNum);
    /// @notice Error for verified block number exceed committed block number
    error VerifiedBlockNumExceedCommittedNum(uint256 verifyingBlockNum);
    /// @notice Error for executed block number exceed proved block number
    error ExecutedBlockNumExceedProvedNum(uint256 pendingBlockNum);
    /// @notice Error for offset is greater than public data length
    error OffsetGtPubDataLength(uint256 offset);
    /// @notice Error for offset is already set
    error OffsetIsSet(uint256 chunkId);
    /// @notice Error for maturity time is not matched
    error MaturityTimeIsNotMatched(uint32 tsbTokenMaturityTime, uint32 createTsbReqMaturityTime);
    /// @notice Error for invalid op type
    error InvalidOpType(Operations.OpType opType);
    /// @notice Error for invalid executed block number
    error InvalidExecutedBlockNum(uint32 executedBlockNum);
    /// @notice Error for redeem with invalid tsb token address
    error InvalidTsbTokenAddr(address invalidTokenAddr);
    /// @notice Error for pending rollup tx hash is not matched
    error PendingRollupTxHashIsNotMatched(bytes32 pendingRollupTxHash, bytes32 executeBlockPendingRollupTxHash);
    /// @notice Error for underlyingAsset token and base token is not matched
    error TokenIsNotMatched(IERC20 underlyingAsset, IERC20 baseToken);
    /// @notice Error for invalid public data when commit evacublock in evacuation mode
    error InvalidEvacuBlockPubData(uint256 evacuationRequestNum);
    /// @notice Error for invalid chunk id delta when commit evacublock in evacuation mode
    error InvalidChunkIdDelta(uint16[] chunkIdDeltas);
    /// @notice Error for removed collateral amount is greater than locked collateral amount
    error RemovedCollateralAmtGtLockedCollateralAmt(uint128 removedCollateralAmt, uint128 lockedCollateralAmt);
    /// @notice Error for invalid matched time when rollup a roll borrow operation
    error InvalidMatchedTime(uint32 matchedTime, uint256 blockTimestamp);
    /// @notice Error for invalid old maturity time, the old maturity time should be greater than the block timestamp
    ///         i.e. cannot roll a matured loan
    error InvalidOldMaturityTime(uint32 oldMaturityTime, uint256 blockTimestamp);
    /// @notice Error for invalid new maturity time, the new maturity time should be greater than the old maturity time
    error InvalidNewMaturityTime(uint32 newMaturityTime, uint32 oldMaturityTime);

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
        address accountAddr,
        uint32 indexed accountId,
        IERC20 token,
        uint16 indexed tokenId,
        uint256 amount
    );

    /// @notice Emitted when evacuation mode is deactivated
    event EvacuModeDeactivation();

    /// @notice Emit when there is a new loan created
    /// @param loanId The id of the loan
    /// @param addedCollateralAmt  The added collateral amount of the loan
    /// @param addedDebtAmt The added debt amount of the loan
    event UpdateLoan(bytes12 indexed loanId, uint128 addedCollateralAmt, uint128 addedDebtAmt);

    /// @notice Emit when there is a loan is roll over
    /// @param loanId The id of the original loan
    /// @param newLoanId The id of the new loan
    /// @param collateralAmt The collateral amount roll over from the original loan to the new loan
    /// @param borrowAmt The borrow amount used to remove the debt amount of the original loan
    /// @param debtAmt The debt amount to the new loan
    event RollOver(
        bytes12 indexed loanId,
        bytes12 indexed newLoanId,
        uint128 collateralAmt,
        uint128 borrowAmt,
        uint128 debtAmt
    );

    /// @notice Emit when there is a roll borrow order is cancelled
    /// @param loanId The id of the loan
    /// @param removedLockedCollateralAmt The removed locked collateral amount of the loan
    event RollBorrowCancel(bytes12 indexed loanId, uint128 removedLockedCollateralAmt);

    /// @notice Commit blocks
    /// @param lastCommittedBlock The last committed block
    /// @param newBlocks The new blocks to be committed
    function commitBlocks(StoredBlock memory lastCommittedBlock, CommitBlock[] calldata newBlocks) external;

    /// @notice Verify blocks
    /// @param verifyingBlocks The committed blocks to be verified and proofs
    function verifyBlocks(VerifyBlock[] calldata verifyingBlocks) external;

    /// @notice Execute blocks
    /// @param pendingBlocks The pending blocks to be executed
    function executeBlocks(ExecuteBlock[] calldata pendingBlocks) external;

    /// @notice Revert blocks
    /// @dev This function is only used for revert the unexecuted blocks
    /// @param revertedBlocks The blocks to be reverted
    function revertBlocks(StoredBlock[] calldata revertedBlocks) external;

    /// @notice Commit evacuation blocks
    /// @param lastCommittedBlock The last committed block
    /// @param evacuBlocks The evacuation blocks to be committed
    function commitEvacuBlocks(StoredBlock memory lastCommittedBlock, CommitBlock[] calldata evacuBlocks) external;

    /// @notice Verify evacuation blocks
    /// @param evacuBlocks The evacuation blocks to be verified and proofs
    function verifyEvacuBlocks(VerifyBlock[] calldata evacuBlocks) external;

    /// @notice Execute evacuation blocks
    /// @param evacuBlocks The evacuation blocks to be executed
    function executeEvacuBlocks(ExecuteBlock[] calldata evacuBlocks) external;

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

    /// @notice Check whether the evacuation request is in the L1 request queue
    /// @param evacuation The evacuation request
    /// @param requestId The id of the request
    /// @return isExisted Return true is the request is existed in the L1 request queue, else return false
    function isEvacuationInL1RequestQueue(
        Operations.Evacuation memory evacuation,
        uint64 requestId
    ) external view returns (bool isExisted);

    /// @notice Check whether the roll borrow request is in the L1 request queue
    /// @param rollBorrow The roll borrow request
    /// @param requestId The id of the request
    /// @return isExisted Return true is the request is existed in the L1 request queue, else return false
    function isRollBorrowInL1RequestQueue(
        Operations.RollBorrow memory rollBorrow,
        uint64 requestId
    ) external view returns (bool);

    /// @notice Check whether the force cancel roll borrow request is in the L1 request queue
    /// @param forceCancelRollBorrow The force cancel roll borrow request
    /// @param requestId The id of the request
    /// @return isExisted Return true is the request is existed in the L1 request queue, else return false
    function isForceCancelRollBorrowInL1RequestQueue(
        Operations.CancelRollBorrow memory forceCancelRollBorrow,
        uint64 requestId
    ) external view returns (bool);

    /// @notice Return the L1 request of the specified id
    /// @param requestId The id of the specified request
    /// @return request The request of the specified id
    function getL1Request(uint64 requestId) external view returns (Request memory request);

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
