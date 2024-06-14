// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITokenWrapper} from "./ITokenWrapper.sol";
import {IAccountFacet} from "../account/IAccountFacet.sol";

contract WrapperRouter {
    address public immutable ZK_TRUEUP;

    constructor(address zkTrueUpAddr) {
        ZK_TRUEUP = zkTrueUpAddr;
    }

    function wrapToDeposit(ITokenWrapper wrapper, uint128 amount) external {
        wrapper.depositFor(address(this), amount);
        wrapper.approve(ZK_TRUEUP, amount);
        IAccountFacet(ZK_TRUEUP).deposit(msg.sender, IERC20(address(wrapper)), amount);
    }

    function unwrapToWithdraw(ITokenWrapper wrapper, uint256 amount) external {
        IAccountFacet(ZK_TRUEUP).withdraw(msg.sender, IERC20(address(wrapper)), amount);
        wrapper.withdrawTo(msg.sender, amount);
    }
}
