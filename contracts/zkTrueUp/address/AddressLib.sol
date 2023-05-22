// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AddressStorage} from "./AddressStorage.sol";

/**
 * @title Term Structure Address Library
 */
library AddressLib {
    /// @notice Internal function to return the address of wETH contract
    /// @return wETHAddr Address of wETH
    function getWETHAddr() internal view returns (address) {
        return AddressStorage.layout().wETHAddr;
    }

    /// @notice Internal function to return the address of PoseidonUnit2 contract
    /// @return poseidonUnit2Addr Address of PoseidonUnit2 contract
    function getPoseidonUnit2Addr() internal view returns (address) {
        return AddressStorage.layout().poseidonUnit2Addr;
    }

    /// @notice Internal function to return the address of Verifier contract
    /// @return verifierAddr Address of Verifier contract
    function getVerifierAddr() internal view returns (address) {
        return AddressStorage.layout().verifierAddr;
    }

    /// @notice Internal function to return the address of Evacuation Verifier contract
    /// @return evacuVerifierAddr Address of Evacuation Verifier contract
    function getEvacuVerifierAddr() internal view returns (address) {
        return AddressStorage.layout().evacuVerifierAddr;
    }
}
