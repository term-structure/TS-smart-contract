// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @notice Configuration of the asset in the network
struct AssetConfig {
    bool isStableCoin;
    bool isTsbToken;
    uint8 decimals;
    uint128 minDepositAmt;
    address tokenAddr;
    address priceFeed;
}

/**
 * @title Term Structure Token Storage
 */
library TokenStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTrueUp.contracts.storage.Token")) - 1);

    struct Layout {
        /// @notice Total number of ERC20 tokens registered in the network.
        uint16 tokenNum;
        /// @notice Mapping of L1 Token Address => L2 Token Id
        mapping(address => uint16) tokenIds;
        /// @notice Mapping of L1 Token Address => isPaused
        mapping(address => bool) isPaused;
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
