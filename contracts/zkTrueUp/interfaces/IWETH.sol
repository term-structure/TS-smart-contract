// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

/**
 * @title WETH interface
 * @author Term Structure Labs
 * @notice Interface for WETH contract
 */
interface IWETH {
    function deposit() external payable;

    function withdraw(uint256) external;

    function approve(address guy, uint256 wad) external returns (bool);

    function transferFrom(
        address src,
        address dst,
        uint256 wad
    ) external returns (bool);

    function balanceOf(address guy) external returns (uint256);

    function mint(address to, uint256 amount) external;
}
