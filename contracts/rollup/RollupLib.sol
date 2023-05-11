// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {SafeCast} from "@solidstate/contracts/utils/SafeCast.sol";
import {RollupStorage, L1Request} from "./RollupStorage.sol";
import {Config} from "../libraries/Config.sol";
import {Operations} from "../libraries/Operations.sol";

library RollupLib {
    /// @notice Error for withdraw amount exceed pending balance
    error WithdrawAmtExceedPendingBalance(uint128 pendingBalance, uint128 withdrawAmt);

    /// @notice Emit when there is a new priority request added
    /// @dev The L1 request needs to be executed before the expiration block or the system will enter the evacuation mode
    /// @param sender The address of the request sender
    /// @param requestId The id of the request
    /// @param opType The operation type of the request
    /// @param pubData The public data of the request
    /// @param expirationBlock The expiration block of the request
    event NewL1Request(
        address indexed sender,
        uint64 requestId,
        Operations.OpType opType,
        bytes pubData,
        uint64 expirationBlock
    );

    /// @notice Add Deposit request and emit Deposit event
    /// @param to The address of the receiver
    /// @param accountId The user account id on layer2
    /// @param tokenId The token id on layer2
    /// @param amount The amount of the token
    function addDepositRequest(address to, uint32 accountId, uint16 tokenId, uint8 decimals, uint128 amount) internal {
        uint128 l2Amt = SafeCast.toUint128((amount * 10 ** Config.SYSTEM_DECIMALS) / 10 ** decimals);
        Operations.Deposit memory op = Operations.Deposit({accountId: accountId, tokenId: tokenId, amount: l2Amt});
        bytes memory pubData = Operations.encodeDepositPubData(op);
        addL1Request(to, Operations.OpType.DEPOSIT, pubData);
    }

    /// @notice Add the L1 request into L1 request queue
    /// @dev The pubData will be hashed with keccak256 and store in the priority queue with its expiration block and operation type
    /// @param sender The address of sender
    /// @param opType The operation type of the priority request
    /// @param pubData The public data of the priority request
    function addL1Request(address sender, Operations.OpType opType, bytes memory pubData) internal {
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        uint64 expirationBlock = uint64(block.number + Config.EXPIRATION_BLOCK);
        uint64 nextL1RequestId = rsl.totalL1RequestNum;
        bytes32 hashedPubData = keccak256(pubData);
        rsl.l1RequestQueue[nextL1RequestId] = L1Request({
            hashedPubData: hashedPubData,
            expirationBlock: expirationBlock,
            opType: opType
        });
        rsl.totalL1RequestNum++;
        emit NewL1Request(sender, nextL1RequestId, opType, pubData, expirationBlock);
    }

    /// @notice Update pending balance and emit Withdraw event
    /// @param sender The address of the sender
    /// @param tokenId The token id on layer2
    /// @param amount The amount of the token
    function updateWithdrawalRecord(address sender, uint16 tokenId, uint128 amount) internal {
        bytes22 key = getPendingBalanceKey(sender, tokenId);
        uint128 pendingBalance = getPendingBalances(key);
        if (pendingBalance < amount) revert WithdrawAmtExceedPendingBalance(pendingBalance, amount);
        unchecked {
            RollupStorage.layout().pendingBalances[key] = pendingBalance - amount;
        }
    }

    /// @notice Return the L1 request of the specified id
    /// @param requestId The id of the specified request
    /// @return request The request of the specified id
    function getL1Request(uint64 requestId) internal view returns (L1Request memory) {
        return RollupStorage.layout().l1RequestQueue[requestId];
    }

    /// @notice Return the number of executed L1 request
    /// @return executedL1RequestNum The number of executed L1 requests
    function getExecutedL1RequestNum() internal view returns (uint64) {
        return RollupStorage.layout().executedL1RequestNum;
    }

    /// @notice Return the pending balance of the specified key
    /// @param key The key of the pending balance
    /// @return pendingBalances The pending balance of the specified key
    function getPendingBalances(bytes22 key) internal view returns (uint128) {
        return RollupStorage.layout().pendingBalances[key];
    }

    /// @notice Return the key of pending balance
    /// @param addr The user address
    /// @param tokenId The token id
    /// @return pendingBalanceKey The key of pending balance
    function getPendingBalanceKey(address addr, uint16 tokenId) internal pure returns (bytes22) {
        return bytes22((uint176(uint160(addr)) | (uint176(tokenId) << 160)));
    }
}
