// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

library TokenStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTureUp.contracts.storage.Token")) - 1);
    using TokenStorage for TokenStorage.Layout;

    function setTokenNum(Layout storage l, uint16 tokenNum) internal {
        l.tokenNum = tokenNum;
    }

    function setTokenId(Layout storage l, address tokenAddr, uint16 tokenId) internal {
        l.tokenIds[tokenAddr] = tokenId;
    }

    function setPaused(Layout storage l, address tokenAddr, bool isPaused) internal {
        l.isPaused[tokenAddr] = isPaused;
    }

    function setAssetConfig(Layout storage l, uint16 tokenId, AssetConfig memory assetConfig) internal {
        l.assetConfigs[tokenId] = assetConfig;
    }

    function getTokenNum(Layout storage l) internal view returns (uint16) {
        return l.tokenNum;
    }

    function getTokenId(Layout storage l, address tokenAddr) internal view returns (uint16) {
        return l.tokenIds[tokenAddr];
    }

    function getPaused(Layout storage l, address tokenAddr) internal view returns (bool) {
        return l.isPaused[tokenAddr];
    }

    function getAssetConfig(Layout storage l, uint16 tokenId) internal view returns (AssetConfig memory) {
        return l.assetConfigs[tokenId];
    }

    /// @notice Configuration of the asset in the network
    struct AssetConfig {
        bool isStableCoin;
        bool isTsbToken;
        uint8 decimals;
        uint128 minDepositAmt;
        address tokenAddr;
        address priceFeed;
    }

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
