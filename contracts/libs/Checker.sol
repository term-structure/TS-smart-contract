// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

library Checker {
    error InvalidZeroAddr();

    function noneZeroAddr(address addr) internal pure {
        if (addr == address(0)) revert InvalidZeroAddr();
    }
}
