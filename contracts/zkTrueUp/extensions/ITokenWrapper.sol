// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title The interface of the Token Wrapper contract
 * @author Term Structure Labs
 * @notice This interface of the Token Wrapper contract
 */
interface ITokenWrapper is IERC20 {
    /**
     * @notice Get the underlying token of the Token Wrapper contract
     * @return The underlying token
     */
    function underlying() external view returns (IERC20);

    /**
     * @notice Deposit the underlying token to the Token Wrapper contract
     * @param account The account to deposit the underlying token
     * @param amount The amount of the underlying token to deposit
     * @return Whether the deposit is successful
     */
    function depositFor(address account, uint256 amount) external returns (bool);

    /**
     * @notice Withdraw the underlying token from the Token Wrapper contract
     * @param account The account to withdraw the underlying token
     * @param amount The amount of the underlying token to withdraw
     * @return Whether the withdraw is successful
     */
    function withdrawTo(address account, uint256 amount) external returns (bool);

    /**
     * @notice Deposit ETH to the contract and mint the wrapped token
     * @param account The account to deposit the wrapped token to
     * @param amount The amount of ETH to deposit
     * @return bool Returns true if the deposit is successful
     */
    function depositForETH(address account, uint256 amount) external payable returns (bool);

    /**
     * @notice Withdraw the wrapped token to ETH
     * @param account The account to withdraw the wrapped token from
     * @param amount The amount of wrapped token to withdraw
     * @return bool Returns true if the withdrawal is successful
     */
    function withdrawToETH(address account, uint256 amount) external returns (bool);
}
