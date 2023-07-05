// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @notice The fund distribution weight of the protocol
struct FundWeight {
    uint16 treasury;
    uint16 insurance;
    uint16 vault;
}

/**
 * @title Term Structure Protocol Params Storage
 */
library ProtocolParamsStorage {
    bytes32 internal constant STORAGE_SLOT =
        bytes32(uint256(keccak256("zkTrueUp.contracts.storage.ProtocolParams")) - 1);

    struct Layout {
        /// @notice Address of the treasury
        address payable treasuryAddr;
        /// @notice Address of the insurance
        address payable insuranceAddr;
        /// @notice Address of the vault
        address payable vaultAddr;
        /// @notice Fund weight for treasury, insurance and vault
        FundWeight fundWeight;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
