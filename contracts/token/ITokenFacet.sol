// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {TokenStorage, AssetConfig} from "./TokenStorage.sol";

interface ITokenFacet {
    /// @notice Error for whitelist token which is already whitelisted
    error TokenIsWhitelisted(address whitelistedTokenAddr);
    /// @notice Error for token number exceed limit
    error TokenNumExceedLimit(uint16 newTokenId);

    /// @notice Emitted when the pause status of a token is set
    /// @param tokenAddr The token address
    /// @param isPaused Whether the token is paused
    event SetPaused(address indexed tokenAddr, bool indexed isPaused);

    /// @notice Emitted when the isStableCoin status of a token is set
    /// @param tokenAddr The token address
    /// @param isStableCoin Whether the token is a stable coin
    event SetIsStableCoin(address indexed tokenAddr, bool indexed isStableCoin);

    /// @notice Emitted when the price feed of a token is set
    /// @param tokenAddr The token address
    /// @param priceFeed The address of the price feed
    event SetPriceFeed(address indexed tokenAddr, address indexed priceFeed);

    /// @notice Emitted when the minimum deposit amount of a token is set
    /// @param tokenAddr The token address
    /// @param minDepositAmt The minimum deposit amount
    event SetMinDepositAmt(address indexed tokenAddr, uint128 indexed minDepositAmt);

    /// @notice Emitted when a new base token is added to the network
    /// @param tokenAddr The token address on Layer1
    /// @param tokenId The token id on Layer2
    /// @param assetConfig The configuration of the token
    event WhitelistBaseToken(address indexed tokenAddr, uint16 indexed tokenId, AssetConfig assetConfig);

    /// @notice Emitted when a new tsb token is added to the network
    /// @param tokenAddr The token address on Layer1
    /// @param tokenId The token id on Layer2
    /// @param assetConfig The configuration of the token
    /// @param maturityTime The maturity time of the tsb token
    event WhitelistTsbToken(
        address indexed tokenAddr,
        uint16 indexed tokenId,
        AssetConfig assetConfig,
        uint32 maturityTime
    );

    /// @notice Add a new token to the network
    /// @param assetConfig The configuration of the token
    function addToken(AssetConfig memory assetConfig) external;

    /// @notice Set the status of a token
    /// @param tokenAddr The token address
    /// @param isPaused Whether the token is paused
    function setPaused(address tokenAddr, bool isPaused) external;

    /// @notice Set the price feed of a token
    /// @param tokenAddr The token address
    /// @param priceFeed The address of the price feed
    function setPriceFeed(address tokenAddr, address priceFeed) external;

    /// @notice Set the isStableCoin status of a token
    /// @param tokenAddr The token address
    /// @param isStableCoin Whether the token is a stable coin
    function setIsStableCoin(address tokenAddr, bool isStableCoin) external;

    /// @notice Set the minimum deposit amount of a token
    /// @param tokenAddr The token address
    /// @param minDepositAmt The minimum deposit amount
    function setMinDepositAmt(address tokenAddr, uint128 minDepositAmt) external;

    function getTokenNum() external view returns (uint16);

    function getTokenId(address tokenAddr) external view returns (uint16);

    function getAssetConfig(uint16 tokenId) external view returns (AssetConfig memory);
}
