// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {UpgradeMockStorage} from "./UpgradeMockStorage.sol";
import {UpgradeMockLib} from "./UpgradeMockLib.sol";
import {IUpgradeMockFacet} from "./IUpgradeMockFacet.sol";

contract UpgradeMockFacet is IUpgradeMockFacet {
    function getValue() external view override returns (uint256) {
        return UpgradeMockLib.getValue();
    }

    function getAddress() external view override returns (address) {
        return UpgradeMockLib.getAddress();
    }

    function setValue(uint256 value) external override {
        UpgradeMockStorage.layout().value = value;
    }

    function setAddress(address addr) external override {
        UpgradeMockStorage.layout().addr = addr;
    }
}
