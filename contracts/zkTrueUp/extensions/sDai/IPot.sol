// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title The `partial` interface of the MakerDAO Pot contract
 * @author Term Structure Labs
 * @notice This interface is used to get the chi rate accumulator for sDai price feed
 */
interface IPot {
    function chi() external view returns (uint256);

    function rho() external view returns (uint256);

    function drip() external returns (uint256);

    function join(uint256) external;

    function exit(uint256) external;
}
