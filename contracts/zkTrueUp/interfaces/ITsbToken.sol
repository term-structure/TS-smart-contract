// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Term Structure Bond Interface
 */
interface ITsbToken is IERC20 {
    /// @notice Mint TSB token
    /// @dev Only TsbFactory can mint
    /// @param to The address mint to
    /// @param amount The amount of the TSB token
    function mint(address to, uint256 amount) external;

    /// @notice Burn TSB token
    /// @dev Only TsbFactory can burn
    /// @param from The address burn from
    /// @param amount The amount of the TSB token
    function burn(address from, uint256 amount) external;

    /// @notice Check if the TSB token is matured
    /// @return isMatured if the TSB token is matured
    function isMatured() external view returns (bool isMatured);

    /// @notice Get the underlying asset and maturity time of the TSB token
    /// @return underlyingAsset The underlying asset of the TSB token
    /// @return maturityTime The maturity time of the TSB token
    function tokenInfo() external view returns (IERC20 underlyingAsset, uint32 maturityTime);
}
