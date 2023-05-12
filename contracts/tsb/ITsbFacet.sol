// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface ITsbFacet {
    /// @notice Error for create TsbToken with invalid maturity time
    error InvalidMaturityTime(uint32 maturityTime);
    /// @notice Error for create TsbToken with invalid base token address
    error UnderlyingAssetIsNotExist(uint16 underlyingTokenId);
    /// @notice Error for create TsbToken which is already exist
    error TsbTokenIsExist(address existTsbTokenAddr);
    /// @notice Error for redeem with invalid tsb token address
    error InvalidTsbTokenAddr(address invalidTokenAddr);
    /// @notice Error for redeem with tsb token which is not matured
    error TsbTokenIsNotMatured(address tsbTokenAddr);

    /// @notice Emitted when a new TSB token is created
    /// @param tsbTokenAddr The address of the created TSB token
    /// @param underlyingTokenId The token id of the underlying asset
    /// @param maturity The maturity of the created TSB token
    event TsbTokenCreated(address indexed tsbTokenAddr, uint16 underlyingTokenId, uint32 maturity);

    /// @notice Emitted when the lender redeem the tsbToken
    /// @param sender The address of the sender
    /// @param tsbTokenAddr The address of the tsbToken
    /// @param underlyingAssetAddr The address of the underlying asset
    /// @param amount The amount of the underlying asset
    /// @param redeemAndDeposit Whether to deposit the underlying asset after redeem the tsbToken
    event Redeem(
        address indexed sender,
        address indexed tsbTokenAddr,
        address underlyingAssetAddr,
        uint256 amount,
        bool redeemAndDeposit
    );

    /// @notice Create a new tsbToken
    /// @param underlyingTokenId The token id of the underlying asset
    /// @param maturityTime The maturity time of the tsbToken
    /// @param name The name of the tsbToken
    /// @param symbol The symbol of the tsbToken
    /// @return tsbTokenAddr The address of the created tsbToken
    function createTsbToken(
        uint16 underlyingTokenId,
        uint32 maturityTime,
        string memory name,
        string memory symbol
    ) external returns (address tsbTokenAddr);

    /// @notice Redeem tsbToken
    /// @dev TSB token can be redeemed only after maturity
    /// @param tsbTokenAddr The address of the tsbToken
    /// @param amount The amount of the tsbToken
    /// @param redeemAndDeposit Whether to deposit the underlying asset after redeem the tsbToken
    function redeem(address tsbTokenAddr, uint128 amount, bool redeemAndDeposit) external;

    /// @notice Get the address of the tsbToken
    /// @param underlyingTokenId The token id of the underlying asset
    /// @param maturity The maturity of the tsbToken
    /// @return tsbTokenAddr The address of the tsbToken
    function getTsbTokenAddr(uint16 underlyingTokenId, uint32 maturity) external view returns (address tsbTokenAddr);

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
    function allowance(address owner, address spender, address tsbTokenAddr) external view returns (uint256);

    /// @notice Check the total supply of the tsbToken
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return totalSupply The total supply of the tsbToken
    function activeSupply(address tsbTokenAddr) external view returns (uint256);

    /// @notice Get the address of the underlying asset of the tsbToken
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return underlyingAsset The address of the underlying asset of the tsbToken
    function getUnderlyingAsset(address tsbTokenAddr) external view returns (address underlyingAsset);

    /// @notice Get the maturity time of the tsbToken
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return maturityTime The maturity time of the tsbToken
    function getMaturityTime(address tsbTokenAddr) external view returns (uint32 maturityTime);
}
