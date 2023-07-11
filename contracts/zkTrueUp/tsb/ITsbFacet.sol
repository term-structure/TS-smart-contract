// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";

/**
 * @title Term Structure Bond Facet Interface
 */
interface ITsbFacet {
    /// @notice Error for create TsbToken with invalid maturity time
    error InvalidMaturityTime(uint32 maturityTime);
    /// @notice Error for create TsbToken with invalid base token address
    error UnderlyingAssetIsNotExist(uint16 underlyingTokenId);
    /// @notice Error for create TsbToken which is already exist
    error TsbTokenIsExist(ITsbToken existTsbToken);
    /// @notice Error for redeem with invalid tsb token
    error InvalidTsbToken(IERC20 invalidToken);
    /// @notice Error for create TsbToken
    error TsbTokenCreateFailed(string name, string symbol, IERC20 underlyingAsset, uint32 maturity);

    /// @notice Emitted when a new TSB token is created
    /// @param tsbToken The created TSB token
    /// @param underlyingAsset The underlying asset of the created TSB token
    /// @param maturity The maturity of the created TSB token
    event TsbTokenCreated(ITsbToken indexed tsbToken, IERC20 underlyingAsset, uint32 maturity);

    /// @notice Emitted when the lender redeem the tsbToken
    /// @param sender The address of the sender
    /// @param tsbToken The tsbToken to redeem
    /// @param underlyingAsset The underlying asset of the tsbToken
    /// @param amount The amount of the underlying asset
    /// @param redeemAndDeposit Whether to deposit the underlying asset after redeem the tsbToken
    event Redemption(
        address indexed sender,
        ITsbToken indexed tsbToken,
        IERC20 underlyingAsset,
        uint256 amount,
        bool redeemAndDeposit
    );

    /// @notice Create a new tsbToken
    /// @param underlyingTokenId The token id of the underlying asset
    /// @param maturityTime The maturity time of the tsbToken
    /// @param name The name of the tsbToken
    /// @param symbol The symbol of the tsbToken
    function createTsbToken(
        uint16 underlyingTokenId,
        uint32 maturityTime,
        string memory name,
        string memory symbol
    ) external;

    /// @notice Redeem tsbToken
    /// @dev TSB token can be redeemed only after maturity
    /// @param tsbToken The tsbToken to redeem
    /// @param amount The amount of the tsbToken
    /// @param redeemAndDeposit Whether to deposit the underlying asset after redeem the tsbToken
    function redeem(ITsbToken tsbToken, uint128 amount, bool redeemAndDeposit) external;

    /// @notice Get the tsbToken
    /// @param underlyingTokenId The token id of the underlying asset
    /// @param maturity The maturity of the tsbToken
    /// @return tsbToken The tsbToken of the underlying asset and maturity
    function getTsbToken(uint16 underlyingTokenId, uint32 maturity) external view returns (ITsbToken tsbToken);

    /// @notice Check the balance of the tsbToken
    /// @param account The address of the account
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return balance The balance of the tsbToken
    function balanceOf(address account, address tsbTokenAddr) external view returns (uint256);

    /// @notice Check the allowance of the tsbToken
    /// @param owner The address of the owner
    /// @param spender The address of the spender
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return allowance_ The allowance of the tsbToken
    function allowance(address owner, address spender, address tsbTokenAddr) external view returns (uint256 allowance_);

    /// @notice Check the total supply of the tsbToken
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return totalSupply The total supply of the tsbToken
    function activeSupply(address tsbTokenAddr) external view returns (uint256 totalSupply);

    /// @notice Return the underlying asset of the tsbToken
    /// @param tsbToken The tsbToken to check
    /// @return underlyingAsset The underlying asset of the tsbToken
    function getUnderlyingAsset(ITsbToken tsbToken) external view returns (IERC20 underlyingAsset);

    /// @notice Return the maturity time of the tsbToken
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return maturityTime The maturity time of the tsbToken
    function getMaturityTime(address tsbTokenAddr) external view returns (uint32 maturityTime);
}
