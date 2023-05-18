// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

/**
 * @title PoseidonUnit2 interface
 * @author Term Structure Labs
 * @notice Interface for Poseidon hash unit2 contract
 */
interface IPoseidonUnit2 {
    function poseidon(uint256[2] memory input) external pure returns (uint256);
}
