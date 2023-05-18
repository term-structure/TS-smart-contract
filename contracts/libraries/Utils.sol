// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";

library Utils {
    /// @notice Error for get zero address
    error InvalidZeroAddr();
    /// @notice Error for get invalid price
    error InvalidPrice(int256 price);

    function noneZeroAddr(address addr) internal pure {
        if (addr == address(0)) revert InvalidZeroAddr();
    }

    /// @notice Get the price of the token
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
}
