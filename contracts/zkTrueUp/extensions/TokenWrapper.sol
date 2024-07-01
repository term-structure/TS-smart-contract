// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC20Wrapper} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWETH} from "../interfaces/IWETH.sol";

/**
 * @title The Token Wrapper contract inherits from the ERC20Wrapper contract
 * @author Term Structure Labs
 * @notice This contract is used to wrap an underlying token
 */
contract TokenWrapper is ERC20Wrapper {
    constructor(
        IERC20 underlyingToken,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) ERC20Wrapper(underlyingToken) {
        // solhint-disable-previous-line no-empty-blocks
    }

    error InvalidMsgValue();
    error InvalidMsgSender();

    function depositForETH(address account, uint256 amount) external payable returns (bool) {
        address sender = _msgSender();
        if (sender == address(this)) revert InvalidMsgSender();
        if (msg.value != amount) revert InvalidMsgValue();
        IWETH(address(underlying())).deposit{value: amount}();
        _mint(account, amount);
        return true;
    }

    function withdrawToETH(address account, uint256 amount) external returns (bool) {
        _burn(_msgSender(), amount);
        IWETH(address(underlying())).withdraw(amount);
        (bool success, ) = payable(account).call{value: amount}("");
        require(success, "Transfer failed");
        return true;
    }
}
