// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ISolidStateERC20} from "@solidstate/contracts/token/ERC20/ISolidStateERC20.sol";
import {SafeERC20} from "@solidstate/contracts/utils/SafeERC20.sol";
import {SafeCast} from "@solidstate/contracts/utils/SafeCast.sol";
import {AddressStorage} from "../address/AddressStorage.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {Config} from "../libraries/Config.sol";

/**
 * @title Term Structure Utils Library
 */
library Utils {
    using SafeERC20 for ISolidStateERC20;
    using AddressLib for AddressStorage.Layout;

    /// @notice Error for get zero address
    error InvalidZeroAddr();
    /// @notice Error for transfer
    error TransferFailed();
    /// @notice Error for invalid msg.value
    error InvalidMsgValue(uint256 msgValue);
    /// @notice Error for inconsistent amount
    error AmountInconsistent(uint128 transferredAmt, uint128 expectedAmt);
    /// @notice Error for get invalid price
    error InvalidPrice(int256 price);

    /// @notice Internal transfer function
    /// @dev Mutated transfer function to handle the case of ETH and ERC20
    /// @param tokenAddr The address of the token to be transferred
    /// @param receiver The address of receiver
    /// @param amount The amount of the token
    function transfer(address tokenAddr, address payable receiver, uint128 amount) internal {
        if (tokenAddr == Config.ETH_ADDRESS) {
            IWETH(AddressLib.getAddressStorage().getWETHAddr()).withdraw(amount);
            (bool success, ) = receiver.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            ISolidStateERC20(tokenAddr).safeTransfer(receiver, amount);
        }
    }

    /// @notice Internal transferFrom function
    /// @dev Mutated transferFrom function to handle the case of ETH and ERC20 to zkTrueUp contract
    /// @param tokenAddr The address of the token to be transferred
    /// @param sender The address of sender
    /// @param amount The amount of the token
    /// @param msgValue The msg.value
    function transferFrom(address tokenAddr, address sender, uint128 amount, uint256 msgValue) internal {
        if (tokenAddr == Config.ETH_ADDRESS) {
            if (msgValue != amount) revert InvalidMsgValue(msgValue);
            IWETH(AddressLib.getAddressStorage().getWETHAddr()).deposit{value: amount}();
        } else {
            if (msgValue != 0) revert InvalidMsgValue(msgValue);
            ISolidStateERC20 token = ISolidStateERC20(tokenAddr);
            uint256 balanceBefore = token.balanceOf(address(this));
            token.safeTransferFrom(sender, address(this), amount);
            uint256 balanceAfter = token.balanceOf(address(this));
            uint128 transferredAmt = SafeCast.toUint128(balanceAfter - balanceBefore);
            if (transferredAmt != amount) revert AmountInconsistent(transferredAmt, amount);
        }
    }

    /// @notice Internal function to get the price from price feed contract
    /// @dev The price is normalized to 18 decimals
    /// @param priceFeed The address of the price feed
    /// @return normalizedPirce The price with 18 decimals
    function getPrice(address priceFeed) internal view returns (uint256) {
        Utils.noneZeroAddr(priceFeed);
        uint8 decimals = AggregatorV3Interface(priceFeed).decimals();
        (, int256 price, , , ) = AggregatorV3Interface(priceFeed).latestRoundData();
        if (price <= 0) revert InvalidPrice(price);
        return uint256(price) * 10 ** (18 - decimals);
    }

    /// @notice Internal function to check the address is not zero address
    /// @param addr The address to be checked
    function noneZeroAddr(address addr) internal pure {
        if (addr == address(0)) revert InvalidZeroAddr();
    }

    /// @notice Internal function to convert L2 amount to L1 amount
    /// @param l2Amt The amount in L2
    /// @param decimals The decimals of the token
    /// @return The amount in L1
    function toL1Amt(uint128 l2Amt, uint8 decimals) internal pure returns (uint128) {
        return SafeCast.toUint128((l2Amt * (10 ** decimals)) / (10 ** Config.SYSTEM_DECIMALS));
    }

    /// @notice Internal function to convert L1 amount to L2 amount
    /// @param l1Amt The amount in L1
    /// @param decimals The decimals of the token
    /// @return The amount in L2
    function toL2Amt(uint128 l1Amt, uint8 decimals) internal pure returns (uint128) {
        return SafeCast.toUint128((l1Amt * 10 ** Config.SYSTEM_DECIMALS) / 10 ** decimals);
    }
}
