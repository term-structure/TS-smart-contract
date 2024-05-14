// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title Term Structure Account Storage
 * @author Term Structure Labs
 */
library AccountStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTrueUp.contracts.storage.Account")) - 1);

    struct Layout {
        /// @notice Total number of registered accounts
        uint32 accountNum;
        /// @notice Mapping of L1 Address => L2 Account Id
        mapping(address => uint32) accountIds;
        /// @notice Mapping of L2 Account Id => L1 Address
        mapping(uint32 => address) accountAddresses;
        /// @notice LoanOwner => delegatee => delegatedActions
        /// @dev User can delegate the right to operate the account to another address
        /// @dev Each delegated action has a unique bit in the delegatedActions mask
        mapping(address => mapping(address => uint256)) delegatedActions;
        /// @notice Mapping address to the first not used nonces for permit functions
        mapping(address => uint256) nonces;
    }

    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            s.slot := slot
        }
    }
}
