// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {UpgradeMockStorage} from "./UpgradeMockStorage.sol";

library UpgradeMockLib {
    function getValue() internal view returns (uint256) {
        return UpgradeMockStorage.layout().value;
    }

    function getAddress() internal view returns (address) {
        return UpgradeMockStorage.layout().addr;
    }
}
