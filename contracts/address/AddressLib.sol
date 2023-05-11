// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AddressStorage} from "./AddressStorage.sol";

library AddressLib {
    /// @notice Return the address of WETH contract
    /// @return wETHAddr Address of wETH
    function getWETHAddr() internal view returns (address) {
        return AddressStorage.layout().wETHAddr;
    }

    /// @notice Return the address of Poseidon hash contract
    /// @return poseidonUnit2Addr Address of Poseidon hash contract
    function getPoseidonUnit2Addr() internal view returns (address) {
        return AddressStorage.layout().poseidonUnit2Addr;
    }

    /// @notice Return the address of Verifier contract
    /// @return verifierAddr Address of Verifier contract
    function getVerifierAddr() internal view returns (address) {
        return AddressStorage.layout().verifierAddr;
    }

    /// @notice Return the address of Evacuation Verifier contract
    /// @return evacuVerifierAddr Address of Evacuation Verifier contract
    function getEvacuVerifierAddr() internal view returns (address) {
        return AddressStorage.layout().evacuVerifierAddr;
    }
}
