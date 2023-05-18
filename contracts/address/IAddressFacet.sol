// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IAddressFacet {
    function setVerifierAddr(address newVerifierAddr) external;

    function setEvacuVerifierAddr(address newEvacuVerifierAddr) external;

    function getWETHAddr() external view returns (address);

    function getPoseidonUnit2Addr() external view returns (address);

    function getVerifierAddr() external view returns (address);

    function getEvacuVerifierAddr() external view returns (address);
}
