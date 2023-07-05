// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AddressStorage} from "./AddressStorage.sol";

/**
 * @title Term Structure Address Library
 */
library AddressLib {
    /// @notice Internal function to return the address of wETH contract
    /// @param s The address storage layout
    /// @return wETHAddr Address of wETH
    function getWETHAddr(AddressStorage.Layout storage s) internal view returns (address) {
        return s.wETHAddr;
    }

    /// @notice Internal function to return the address of PoseidonUnit2 contract
    /// @param s The address storage layout
    /// @return poseidonUnit2Addr Address of PoseidonUnit2 contract
    function getPoseidonUnit2Addr(AddressStorage.Layout storage s) internal view returns (address) {
        return s.poseidonUnit2Addr;
    }

    /// @notice Internal function to return the address of Verifier contract
    /// @param s The address storage layout
    /// @return verifierAddr Address of Verifier contract
    function getVerifierAddr(AddressStorage.Layout storage s) internal view returns (address) {
        return s.verifierAddr;
    }

    /// @notice Internal function to return the address of Evacuation Verifier contract
    /// @param s The address storage layout
    /// @return evacuVerifierAddr Address of Evacuation Verifier contract
    function getEvacuVerifierAddr(AddressStorage.Layout storage s) internal view returns (address) {
        return s.evacuVerifierAddr;
    }

    /// @notice Internal function to return the address of Aave V3 pool contract
    /// @param s The address storage layout
    /// @return aaveV3PoolAddr Address of Aave V3 pool contract
    function getAaveV3PoolAddr(AddressStorage.Layout storage s) internal view returns (address) {
        return s.aaveV3PoolAddr;
    }

    /// @notice Internal function to get the address storage layout
    /// @return AddressStorage The address storage layout
    function getAddressStorage() internal pure returns (AddressStorage.Layout storage) {
        return AddressStorage.layout();
    }
}
