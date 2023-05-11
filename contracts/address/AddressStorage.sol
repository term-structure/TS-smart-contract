// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

library AddressStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTureUp.contracts.storage.Address")) - 1);

    struct Layout {
        /// @notice WETH gateway address
        address wETHAddr;
        /// @notice Poseidon hash contract address
        address poseidonUnit2Addr;
        /// @notice Verifier contract address
        address verifierAddr;
        /// @notice Evacuation verifier contract address
        address evacuVerifierAddr;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
