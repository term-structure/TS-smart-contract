// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Term Structure Bond Interface
 */
interface ITsbToken is IERC20 {
    /// @notice Mint TSB token
    /// @dev Only TsbFactory can mint
    /// @param account The address of the account
    /// @param amount The amount of the TSB token
    function mint(address account, uint256 amount) external;

    /// @notice Burn TSB token
    /// @dev Only TsbFactory can burn
    /// @param account The address of the account
    /// @param amount The amount of the TSB token
    function burn(address account, uint256 amount) external;

    /// @notice The address of the ZkTrueUp contract
    /// @return zkTrueUpAddr address of the ZkTrueUp contract
    function zkTrueUp() external view returns (address zkTrueUpAddr);

    /// @notice Check if the TSB token is matured
    /// @return isMatured if the TSB token is matured
    function isMatured() external view returns (bool isMatured);

    /// @notice Get the underlying asset and maturity time of the TSB token
    /// @return underlyingAsset The underlying asset of the TSB token
    /// @return maturityTime The maturity time of the TSB token
    function tokenInfo() external view returns (address underlyingAsset, uint32 maturityTime);
}
