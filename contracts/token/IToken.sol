// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IToken {
    /// @notice Emitted when the pause status of a token is set
    /// @param tokenAddr The token address
    /// @param isPaused Whether the token is paused
    event SetPaused(address indexed tokenAddr, bool indexed isPaused);

    /// @notice Set the status of a token
    /// @param tokenAddr The token address
    /// @param isPaused Whether the token is paused
    function setPaused(address tokenAddr, bool isPaused) external;

    function getTokenNum() external view returns (uint16);

    function getTokenId(address tokenAddr) external view returns (uint16);
}
