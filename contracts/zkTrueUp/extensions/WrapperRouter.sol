// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
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
    using SafeCast for *;

    // The zkTrueUp contract address
    address public ZK_TRUEUP;

    error FailedToDeposit();
    error FailedToWithdraw();

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
     * @param wrapAmount The amount to wrap
     * @param depositAmount The amount to deposit
     */
    function wrapToDeposit(
        ITokenWrapper wrappedToken,
        uint256 wrapAmount,
        uint128 depositAmount
    ) external nonReentrant {
        wrappedToken.underlying().safeTransferFrom(msg.sender, address(this), wrapAmount);
        wrappedToken.underlying().approve(address(wrappedToken), wrapAmount);
        wrappedToken.depositFor(address(this), wrapAmount);

        int256 diff = wrapAmount.toInt256() - depositAmount.toInt256();
        if (diff < 0) {
            // if wrapAmount < depositAmount, send the diff from the sender to deposit
            wrappedToken.safeTransferFrom(msg.sender, address(this), uint256(-diff));
        }

        wrappedToken.approve(ZK_TRUEUP, depositAmount);

        try IAccountFacet(ZK_TRUEUP).deposit(msg.sender, IERC20(address(wrappedToken)), depositAmount) {
            if (diff > 0) {
                // if wrapAmount > depositAmount, send the diff back to the sender
                wrappedToken.safeTransfer(msg.sender, uint256(diff));
            }
        } catch {
            revert FailedToDeposit();
        }
    }

    /**
     * @notice Withdraw from zkTrueUp and unwrap the token to the underlying token
     * @param wrappedToken The wrapped token address
     * @param unwrapAmount The amount to unwrap
     * @param withdrawAmount The amount to withdraw
     */
    function withdrawToUnwrap(
        ITokenWrapper wrappedToken,
        uint256 unwrapAmount,
        uint256 withdrawAmount
    ) external nonReentrant {
        try IAccountFacet(ZK_TRUEUP).withdraw(msg.sender, IERC20(address(wrappedToken)), withdrawAmount) {
            wrappedToken.safeTransferFrom(msg.sender, address(this), unwrapAmount);
            wrappedToken.withdrawTo(msg.sender, unwrapAmount);
        } catch {
            revert FailedToWithdraw();
        }
    }
}
