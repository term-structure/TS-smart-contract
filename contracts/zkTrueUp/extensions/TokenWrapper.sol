// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC20Wrapper} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

/**
 * @title The Token Wrapper contract inherits from the ERC20Wrapper contract
 * @author Term Structure Labs
 * @notice This contract is used to wrap an underlying token
 */
contract TokenWrapper is ERC20Wrapper, ReentrancyGuard {
    constructor(
        IERC20 underlyingToken,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) ERC20Wrapper(underlyingToken) {
        // solhint-disable-previous-line no-empty-blocks
    }

    error InvalidMsgValue();
    error InvalidMsgSender();

    /**
     * @notice Deposit ETH to the contract and mint the wrapped token
     * @param account The account to deposit the wrapped token to
     * @param amount The amount of ETH to deposit
     * @return bool Returns true if the deposit is successful
     */
    function depositForETH(address account, uint256 amount) external payable returns (bool) {
        address sender = _msgSender();
        if (sender == address(this)) revert InvalidMsgSender();
        if (msg.value != amount) revert InvalidMsgValue();
        IWETH(address(underlying())).deposit{value: amount}();
        _mint(account, amount);
        return true;
    }

    /**
     * @notice Withdraw the wrapped token to ETH
     * @param account The account to withdraw the wrapped token from
     * @param amount The amount of wrapped token to withdraw
     * @return bool Returns true if the withdrawal is successful
     */
    function withdrawToETH(address account, uint256 amount) external nonReentrant returns (bool) {
        _burn(_msgSender(), amount);
        IWETH(address(underlying())).withdraw(amount);
        (bool success, ) = payable(account).call{value: amount}("");
        require(success, "Transfer failed");
        return true;
    }

    receive() external payable {
        // solhint-disable-previous-line no-empty-blocks
    }
}
