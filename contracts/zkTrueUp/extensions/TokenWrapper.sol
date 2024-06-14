// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC20Wrapper} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TokenWrapper is ERC20Wrapper {
    constructor(
        IERC20 underlyingToken,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) ERC20Wrapper(underlyingToken) {
        // solhint-disable-previous-line no-empty-blocks
    }
}
