// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/// @notice Configuration of the asset in the network
struct AssetConfig {
    bool isStableCoin;
    bool isTsbToken;
    uint8 decimals;
    uint128 minDepositAmt;
    IERC20 token;
    AggregatorV3Interface priceFeed;
}

/**
 * @title Term Structure Token Storage
 */
library TokenStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTrueUp.contracts.storage.Token")) - 1);

    struct Layout {
        /// @notice Total number of ERC20 tokens registered in the network.
        uint16 tokenNum;
        /// @notice Mapping of L1 Token => L2 Token Id
        mapping(IERC20 => uint16) tokenIds;
        /// @notice Mapping of L1 Token => paused
        mapping(IERC20 => bool) paused;
        /// @notice Mapping of Token Id => AssetConfig
        mapping(uint16 => AssetConfig) assetConfigs;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
