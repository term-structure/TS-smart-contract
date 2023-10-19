// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {SafeCast} from "@solidstate/contracts/utils/SafeCast.sol";
import {AddressStorage} from "../address/AddressStorage.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {TsbLib} from "../tsb/TsbLib.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {Config} from "../libraries/Config.sol";

/**
 * @title Utils Library
 * @author Term Structure Labs
 * @notice Utility functions for zkTrueUp
 */
library Utils {
    using Math for *;
    using SafeERC20 for IERC20;
    using AddressLib for AddressStorage.Layout;

    /// @notice Error for get zero address
    error InvalidZeroAddr(address addr);
    /// @notice Error for transfer
    error TransferFailed(address receiver, uint256 amount, bytes data);
    /// @notice Error for invalid msg.value
    error InvalidMsgValue(uint256 msgValue);
    /// @notice Error for get invalid price
    error InvalidPrice(int256 price);
    /// @notice Error for transferFrom amount inconsistent when transferFrom non-standard ERC20
    error AmountInconsistent(uint256 amount, uint256 transferredAmt);

    /// @notice Internal token transfer function to handle the case of Tsb Token or Base Token
    ///         if the token is Tsb Token, then mint Tsb Token to receiver, otherwise transfer the token to receiver
    /// @param token The token to be transferred
    /// @param to The address of receiver
    /// @param amount The amount of the token
    /// @param isTsbToken The flag to indicate whether the token is Tsb Token
    function tokenTransfer(IERC20 token, address payable to, uint256 amount, bool isTsbToken) internal {
        isTsbToken ? TsbLib.mintTsbToken(ITsbToken(address(token)), to, amount) : transfer(token, to, amount);
    }

    /// @notice Internal token transferFrom function to handle the case of Tsb Token or Base Token
    ///         if the token is Tsb Token, then burn Tsb Token from sender, otherwise transferFrom the token from sender
    /// @param token The token to be transferred
    /// @param from The address of sender
    /// @param amount The amount of the token
    /// @param msgValue The msg.value
    /// @param isTsbToken The flag to indicate whether the token is Tsb Token
    function tokenTransferFrom(IERC20 token, address from, uint256 amount, uint256 msgValue, bool isTsbToken) internal {
        isTsbToken
            ? TsbLib.burnTsbToken(ITsbToken(address(token)), from, amount)
            : transferFrom(token, from, amount, msgValue);
    }

    /// @notice Internal transfer function
    /// @dev Mutated transfer function to handle the case of ETH and ERC20
    /// @param token The token to be transferred
    /// @param receiver The address of receiver
    /// @param amount The amount of the token
    function transfer(IERC20 token, address payable receiver, uint256 amount) internal {
        if (address(token) == Config.ETH_ADDRESS) {
            AddressStorage.layout().getWETH().withdraw(amount);
            (bool success, bytes memory data) = receiver.call{value: amount}("");
            if (!success) revert TransferFailed(receiver, amount, data);
        } else {
            token.safeTransfer(receiver, amount);
        }
    }

    /// @notice Internal transferFrom function
    /// @dev Mutated transferFrom function to handle the case of ETH and ERC20 to zkTrueUp contract
    /// @param token The token to be transferred
    /// @param sender The address of sender
    /// @param amount The amount of the token
    /// @param msgValue The msg.value
    function transferFrom(IERC20 token, address sender, uint256 amount, uint256 msgValue) internal {
        if (address(token) == Config.ETH_ADDRESS) {
            if (msgValue != amount) revert InvalidMsgValue(msgValue);
            AddressStorage.layout().getWETH().deposit{value: amount}();
        } else {
            if (msgValue != 0) revert InvalidMsgValue(msgValue);
            uint256 balanceBefore = token.balanceOf(address(this));
            token.safeTransferFrom(sender, address(this), amount);
            uint256 balanceAfter = token.balanceOf(address(this));
            uint256 transferredAmt = balanceAfter - balanceBefore;
            if (amount != transferredAmt) revert AmountInconsistent(amount, transferredAmt);
        }
    }

    /// @notice Internal function to get the price from price feed contract
    /// @dev The price is normalized to 18 decimals
    /// @param priceFeed The address of the price feed
    /// @return normalizedPirce The price with 18 decimals
    function getPrice(AggregatorV3Interface priceFeed) internal view returns (uint256) {
        notZeroAddr(address(priceFeed));
        uint8 decimals = priceFeed.decimals();
        (, int256 price, , , ) = priceFeed.latestRoundData();
        if (price <= 0) revert InvalidPrice(price);

        return uint256(price) * 10 ** (18 - decimals);
    }

    /// @notice Internal function to check the address is not zero address
    /// @param addr The address to be checked
    function notZeroAddr(address addr) internal pure {
        if (addr == address(0)) revert InvalidZeroAddr(addr);
    }

    /// @notice Internal function to convert L2 amount to L1 amount
    /// @param l2Amt The amount in L2
    /// @param decimals The decimals of the token
    /// @return The amount in L1
    function toL1Amt(uint128 l2Amt, uint8 decimals) internal pure returns (uint256) {
        return l2Amt.mulDiv(10 ** decimals, Config.SYSTEM_DECIMALS_BASE);
    }

    /// @notice Internal function to convert L1 amount to L2 amount
    /// @param l1Amt The amount in L1
    /// @param decimals The decimals of the token
    /// @return The amount in L2
    function toL2Amt(uint256 l1Amt, uint8 decimals) internal pure returns (uint128) {
        return SafeCast.toUint128(l1Amt.mulDiv(Config.SYSTEM_DECIMALS_BASE, 10 ** decimals));
    }
}
