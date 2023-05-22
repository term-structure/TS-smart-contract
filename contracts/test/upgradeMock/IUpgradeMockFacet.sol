// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IUpgradeMockFacet {
    function getValue() external view returns (uint256);

    function getAddress() external view returns (address);

    function setValue(uint256 value) external;

    function setAddress(address addr) external;
}
