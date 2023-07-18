// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {TokenStorage, AssetConfig} from "./TokenStorage.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";

/**
 * @title Term Structure Token Facet Interface
 * @author Term Structure Labs
 */
interface ITokenFacet {
    /// @notice Error for whitelist token which is already whitelisted
    error TokenIsWhitelisted(IERC20 whitelistedToken);
    /// @notice Error for token number exceed limit
    error TokenNumExceedLimit(uint16 newTokenId);

    /// @notice Emitted when the pause status of a token is set
    /// @param token The token to be paused
    /// @param isPaused Whether the token is paused
    event SetPaused(IERC20 indexed token, bool indexed isPaused);

    /// @notice Emitted when the isStableCoin status of a token is set
    /// @param token The token to be set
    /// @param isStableCoin Whether the token is a stable coin
    event SetStableCoin(IERC20 indexed token, bool indexed isStableCoin);

    /// @notice Emitted when the price feed of a token is set
    /// @param token The token to be set
    /// @param priceFeed The address of the price feed
    event SetPriceFeed(IERC20 indexed token, AggregatorV3Interface indexed priceFeed);

    /// @notice Emitted when the minimum deposit amount of a token is set
    /// @param token The token to be set
    /// @param minDepositAmt The minimum deposit amount
    event SetMinDepositAmt(IERC20 indexed token, uint128 indexed minDepositAmt);

    /// @notice Emitted when a new base token is added to the network
    /// @param token The whitelisted base token
    /// @param tokenId The token id on Layer2
    /// @param assetConfig The configuration of the token
    event BaseTokenWhitelisted(IERC20 indexed token, uint16 indexed tokenId, AssetConfig assetConfig);

    /// @notice Emitted when a new tsb token is added to the network
    /// @param tsbToken The whitelisted tsb token
    /// @param tokenId The token id on Layer2
    /// @param assetConfig The configuration of the token
    /// @param maturityTime The maturity time of the tsb token
    event TsbTokenWhitelisted(
        ITsbToken indexed tsbToken,
        uint16 indexed tokenId,
        AssetConfig assetConfig,
        uint32 maturityTime
    );

    /// @notice Add a new token to the network
    /// @param assetConfig The configuration of the token
    function addToken(AssetConfig memory assetConfig) external;

    /// @notice Set the status of a token
    /// @param token The token to be set
    /// @param isPaused Whether the token is paused
    function setPaused(IERC20 token, bool isPaused) external;

    /// @notice Set the price feed of a token
    /// @param token The token to be set
    /// @param priceFeed The address of the price feed
    function setPriceFeed(IERC20 token, AggregatorV3Interface priceFeed) external;

    /// @notice Set the isStableCoin status of a token
    /// @param token The token to be set
    /// @param isStableCoin Whether the token is a stable coin
    function setStableCoin(IERC20 token, bool isStableCoin) external;

    /// @notice Set the minimum deposit amount of a token
    /// @param token The token to be set
    /// @param minDepositAmt The minimum deposit amount
    function setMinDepositAmt(IERC20 token, uint128 minDepositAmt) external;

    /// @notice Return the token number
    /// @return tokenNum The token number
    function getTokenNum() external view returns (uint16 tokenNum);

    /// @notice Return the token id
    /// @param token The token to be queried
    /// @return tokenId The token id
    function getTokenId(IERC20 token) external view returns (uint16 tokenId);

    /// @notice Return the asset config of a token by token id
    /// @param tokenId The token id
    /// @return assetConfig The asset config of the token
    function getAssetConfig(uint16 tokenId) external view returns (AssetConfig memory assetConfig);

    /// @notice Return the status of a token
    /// @param token The token to be queried
    /// @return isPaused Whether the token is paused
    function isTokenPaused(IERC20 token) external view returns (bool isPaused);
}
