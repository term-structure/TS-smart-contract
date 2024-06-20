// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ITokenWrapper} from "./ITokenWrapper.sol";
import {IAccountFacet} from "../account/IAccountFacet.sol";

contract WrapperRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeERC20 for ITokenWrapper;

    address public immutable ZK_TRUEUP;

    constructor(address zkTrueUpAddr) {
        ZK_TRUEUP = zkTrueUpAddr;
    }

    function wrapToDeposit(ITokenWrapper wrappedToken, uint128 amount) external nonReentrant {
        wrappedToken.underlying().safeTransferFrom(msg.sender, address(this), amount);
        wrappedToken.underlying().approve(address(wrappedToken), amount);

        wrappedToken.depositFor(address(this), amount);
        wrappedToken.approve(ZK_TRUEUP, amount);

        IAccountFacet(ZK_TRUEUP).deposit(msg.sender, IERC20(address(wrappedToken)), amount);
    }

    function unwrapToWithdraw(ITokenWrapper wrappedToken, uint256 amount) external nonReentrant {
        IAccountFacet(ZK_TRUEUP).withdraw(msg.sender, IERC20(address(wrappedToken)), amount);

        wrappedToken.safeTransferFrom(msg.sender, address(this), amount);
        wrappedToken.withdrawTo(msg.sender, amount);
    }
}
