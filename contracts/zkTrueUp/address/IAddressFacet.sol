// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IWETH} from "../interfaces/IWETH.sol";
import {IPoseidonUnit2} from "../interfaces/IPoseidonUnit2.sol";
import {IVerifier} from "../interfaces/IVerifier.sol";
import {IPool} from "../interfaces/aaveV3/IPool.sol";

/**
 * @title Term Structure Address Facet Interface
 */
interface IAddressFacet {
    /// @notice Emitted when the new verifier contract is set
    /// @param newVerifier The new verifier contract
    event SetVerifier(IVerifier indexed newVerifier);

    /// @notice Emitted when the new evacuVerifier contract is set
    /// @param newEvacuVerifier The new evacuVerifier contract
    event SetEvacuVerifier(IVerifier indexed newEvacuVerifier);

    /// @notice Set new verifier contract
    /// @param newVerifier The new verifier contract
    function setVerifier(IVerifier newVerifier) external;

    /// @notice Set new evacuVerifier contract
    /// @param newEvacuVerifier The new evacuVerifier contract
    function setEvacuVerifier(IVerifier newEvacuVerifier) external;

    /// @notice Get WETH contract
    /// @return weth The WETH contract
    function getWETH() external view returns (IWETH weth);

    /// @notice Get PoseidonUnit2 contract
    /// @return poseidonUnit2 The PoseidonUnit2 contract
    function getPoseidonUnit2() external view returns (IPoseidonUnit2 poseidonUnit2);

    /// @notice Get verifier contract
    /// @return verifier The verifier contract
    function getVerifier() external view returns (IVerifier verifier);

    /// @notice Get evacuVerifier contract
    /// @return evacuVerifier The evacuVerifier contract
    function getEvacuVerifier() external view returns (IVerifier evacuVerifier);

    /// @notice Get Aave V3 pool contract
    /// @return aaveV3Pool The Aave V3 pool contract
    function getAaveV3Pool() external view returns (IPool aaveV3Pool);
}
