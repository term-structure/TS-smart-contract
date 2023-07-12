// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AddressStorage} from "./AddressStorage.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {IPoseidonUnit2} from "../interfaces/IPoseidonUnit2.sol";
import {IVerifier} from "../interfaces/IVerifier.sol";
import {IPool} from "../interfaces/aaveV3/IPool.sol";

/**
 * @title Term Structure Address Library
 */
library AddressLib {
    /// @notice Internal function to return the wETH contract
    /// @param s The address storage layout
    /// @return wETH The WETH contract
    function getWETH(AddressStorage.Layout storage s) internal view returns (IWETH) {
        return s.wETH;
    }

    /// @notice Internal function to return the PoseidonUnit2 contract
    /// @param s The address storage layout
    /// @return poseidonUnit2 The PoseidonUnit2 contract
    function getPoseidonUnit2(AddressStorage.Layout storage s) internal view returns (IPoseidonUnit2) {
        return s.poseidonUnit2;
    }

    /// @notice Internal function to return the Verifier contract
    /// @param s The address storage layout
    /// @return verifier The Verifier contract
    function getVerifier(AddressStorage.Layout storage s) internal view returns (IVerifier) {
        return s.verifier;
    }

    /// @notice Internal function to return the Evacuation Verifier contract
    /// @param s The address storage layout
    /// @return evacuVerifier The Evacuation Verifier contract
    function getEvacuVerifier(AddressStorage.Layout storage s) internal view returns (IVerifier) {
        return s.evacuVerifier;
    }

    /// @notice Internal function to return the Aave V3 pool contract
    /// @param s The address storage layout
    /// @return aaveV3Pool The Aave V3 pool contract
    function getAaveV3Pool(AddressStorage.Layout storage s) internal view returns (IPool) {
        return s.aaveV3Pool;
    }
}
