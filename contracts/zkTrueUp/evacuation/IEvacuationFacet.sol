// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Operations} from "../libraries/Operations.sol";
import {StoredBlock, CommitBlock, Proof} from "../rollup/RollupStorage.sol";

/**
 * @title Term Structure Evacuation Facet Interface
 * @author Term Structure Labs
 */
interface IEvacuationFacet {
    /// @notice Error for activate evacuation mode, but the timestamp is not expired
    error TimeStampIsNotExpired(uint256 curTimestamp, uint256 expirationTime);
    /// @notice Error for consume L1 request but the request is evacuation (already consumed all L1 requests)
    error LastL1RequestIsEvacuation(uint64 totalL1RequestNum);
    /// @notice Error for consumed request number exceed total request number
    error ConsumedRequestNumExceedTotalNum(uint256 consumedRequestNum);
    /// @notice Error for invalid consumed public data mismatch the data in the request queue
    error InvalidConsumedPubData(uint64 l1RequestNum, bytes pubData);
    /// @notice Error for invalid op type
    error InvalidOpType(Operations.OpType opType);
    /// @notice Error for invalid evacuate public data length
    error InvalidEvacuatePubDataLength(uint256 pubDataLength);
    /// @notice Error for refund deregistered address but the account is not deregistered
    error NotDeregisteredAddr(address accountAddr, uint32 accountId);
    /// @notice Error for account address is not the msg.sender
    error AccountAddrIsNotCaller(address accountAddr, address sender);
    /// @notice Error for invalid chunk id delta when commit evacublock in evacuation mode
    error InvalidChunkIdDelta(uint16[] chunkIdDeltas);
    /// @notice Error for the specified accountId and tokenId is already evacuated
    error Evacuated(uint32 accountId, uint16 tokenId);

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

    /// @notice Emitted when evacuation mode is activated
    event EvacuModeActivation();

    /// @notice Emit when there is a new L1 request consumed
    /// @dev Consumed number is the number of the executed L1 request - 1
    /// @param executedL1RequestNum The number of the executed L1 request
    /// @param opType The type of the L1 request
    /// @param pubData The public data of the L1 request
    event L1RequestConsumed(uint64 executedL1RequestNum, Operations.OpType opType, bytes pubData);

    /// @notice Emit when an account is de-registered
    /// @notice De-registered only remove the accountAddr -> accountId mapping,
    ///         but not remove the accountId -> accountAddr mapping,
    ///         this is for user can still refund their asset by `refundDeregisteredAddr`
    /// @param accountAddr The address of the account
    /// @param accountId The id of the account
    event AccountDeregistered(address accountAddr, uint32 indexed accountId);

    /// @notice When L2 system is down, anyone can call this function to activate the evacuation mode
    function activateEvacuation() external;

    /// @notice Consume the L1 non-executed requests in the evacuation mode
    /// @param consumedTxPubData The public data of the non-executed L1 requests which in the request queue
    function consumeL1RequestInEvacuMode(bytes[] calldata consumedTxPubData) external;

    /// @notice Evacuate the funds of a specified user and token in the evacuMode
    /// @param lastExecutedBlock The last executed block
    /// @param newBlock A pseudo block to create block commitment for verification but not to be commited
    /// @param proof The proof of the newBlock
    function evacuate(
        StoredBlock memory lastExecutedBlock,
        CommitBlock calldata newBlock,
        Proof calldata proof
    ) external;

    /// @notice Refund the deregistered address
    /// @param token The token to be refunded
    /// @param amount The amount of the token to be refunded
    /// @param accountId The account id to be refunded
    function refundDeregisteredAddr(IERC20 token, uint256 amount, uint32 accountId) external;

    /// @notice Return the evacuation mode is activated or not
    /// @return evacuMode The evacuation mode status
    function isEvacuMode() external view returns (bool evacuMode);

    /// @notice Return the specified address and token is evacuated or not
    /// @param addr The address to be checked
    /// @param tokenId The id of the token
    /// @return isEvacuted Return true is the token is evacuated, else return false
    function isEvacuted(address addr, uint16 tokenId) external view returns (bool);
}
