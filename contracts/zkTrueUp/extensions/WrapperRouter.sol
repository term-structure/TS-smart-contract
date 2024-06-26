// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ITokenWrapper} from "./ITokenWrapper.sol";
import {IAccountFacet} from "../account/IAccountFacet.sol";

/**
 * @title The WrapperRouter contract help to warp to deposit and withdraw to unwrap in zkTrueUp
 * @author Term Structure Labs
 * @notice This contract is used to wrap to deposit and unwrap to withdraw in zkTrueUp
 */
contract WrapperRouter is UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    using SafeERC20 for ITokenWrapper;

    // The zkTrueUp contract address
    address public ZK_TRUEUP;

    // constructor() {
    //     _disableInitializers();
    // }

    function initialize(address zkTrueUp) external initializer {
        ZK_TRUEUP = zkTrueUp;
        __ReentrancyGuard_init_unchained();
        __Ownable_init_unchained();
    }

    function _authorizeUpgrade(address newImplementation) internal view override onlyOwner {
        // solhint-disable-previous-line no-empty-blocks
    }

    /**
     * @notice Wrap the underlying token and deposit to zkTrueUp
     * @param wrappedToken The wrapped token address
     * @param amount The amount to wrap and deposit
     */
    function wrapToDeposit(ITokenWrapper wrappedToken, uint128 amount) external nonReentrant {
        wrappedToken.underlying().safeTransferFrom(msg.sender, address(this), amount);
        wrappedToken.underlying().approve(address(wrappedToken), amount);

        wrappedToken.depositFor(address(this), amount);
        wrappedToken.approve(ZK_TRUEUP, amount);

        IAccountFacet(ZK_TRUEUP).deposit(msg.sender, IERC20(address(wrappedToken)), amount);
    }

    /**
     * @notice Withdraw from zkTrueUp and unwrap the token to the underlying token
     * @param wrappedToken The wrapped token address
     * @param amount The amount to withdraw and unwrap
     */
    function withdrawToUnwrap(ITokenWrapper wrappedToken, uint256 amount) external nonReentrant {
        IAccountFacet(ZK_TRUEUP).withdraw(msg.sender, IERC20(address(wrappedToken)), amount);

        wrappedToken.safeTransferFrom(msg.sender, address(this), amount);
        wrappedToken.withdrawTo(msg.sender, amount);
    }
}
