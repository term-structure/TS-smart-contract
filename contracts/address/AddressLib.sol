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
}
