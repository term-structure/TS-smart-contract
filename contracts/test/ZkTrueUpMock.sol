// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ZkTrueUp} from "../ZkTrueUp.sol";

contract ZkTrueUpMock is ZkTrueUp {
    function getStorageAt(uint256 slot) external view returns (uint256) {
        uint256 value;
        assembly {
            value := sload(slot)
        }
        return value;
    }
}
