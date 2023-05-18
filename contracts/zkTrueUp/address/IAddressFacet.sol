// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IAddressFacet {
    /// @notice Set the address of verifier contract
    /// @param newVerifierAddr The new verifier contract address
    function setVerifierAddr(address newVerifierAddr) external;

    /// @notice Set the address of evacuVerifier contract
    /// @param newEvacuVerifierAddr The new evacuVerifier contract address
    function setEvacuVerifierAddr(address newEvacuVerifierAddr) external;

    /// @notice Get the address of WETH contract
    /// @return wethAddr The address of WETH contract
    function getWETHAddr() external view returns (address wethAddr);

    /// @notice Get the address of PoseidonUnit2 contract
    /// @return poseidonUnit2Addr The address of PoseidonUnit2 contract
    function getPoseidonUnit2Addr() external view returns (address poseidonUnit2Addr);

    /// @notice Get the address of verifier contract
    /// @return verifierAddr The address of verifier contract
    function getVerifierAddr() external view returns (address verifierAddr);

    /// @notice Get the address of evacuVerifier contract
    /// @return evacuVerifierAddr The address of evacuVerifier contract
    function getEvacuVerifierAddr() external view returns (address evacuVerifierAddr);
}
