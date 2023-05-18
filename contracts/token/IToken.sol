// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IToken {
    function getTokenNum() external view returns (uint16);

    function getTokenId(address tokenAddr) external view returns (uint16);
}
