// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title TsbController interface
 * @author Term Structure Labs
 * @notice Interface for TsbController contract
 */
interface ITsbController {
    /// @notice Error for create TsbToken with invalid maturity time
    error InvalidMaturityTime(uint32 maturityTime);
    /// @notice Error for create TsbToken with invalid base token address
    error UnderlyingAssetIsNotExist(uint16 underlyingTokenId);
    /// @notice Error for create TsbToken which is already exist
    error TsbTokenIsExist(address existTsbTokenAddr);

    /// @notice Emitted when a new TSB token is created
    /// @param tsbTokenAddr The address of the created TSB token
    /// @param underlyingTokenId The token id of the underlying asset
    /// @param maturity The maturity of the created TSB token
    event TsbTokenCreated(address indexed tsbTokenAddr, uint16 underlyingTokenId, uint32 maturity);

    /// @notice Emitted when a TSB token is minted
    /// @param tsbTokenAddr The address of the minted TSB token
    /// @param accountAddr The L1 address of the minted TSB token
    /// @param amount The amount of the minted TSB token
    event TsbTokenMinted(address indexed tsbTokenAddr, address indexed accountAddr, uint256 amount);

    /// @notice Emitted when a TSB token is burned
    /// @param tsbTokenAddr The address of the burned TSB token
    /// @param accountAddr The L1 address of the burned TSB token
    /// @param amount The amount of the burned TSB token
    event TsbTokenBurned(address indexed tsbTokenAddr, address indexed accountAddr, uint256 amount);

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

    /// @notice Mint tsbToken
    /// @param tsbTokenAddr The address of the tsbToken
    /// @param to The address of the recipient
    /// @param amount The amount of the tsbToken
    function mintTsbToken(address tsbTokenAddr, address to, uint128 amount) external;

    /// @notice Burn tsbToken
    /// @param tsbTokenAddr The address of the tsbToken
    /// @param from The address of the sender
    /// @param amount The amount of the tsbToken to burn
    function burnTsbToken(address tsbTokenAddr, address from, uint128 amount) external;

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

    /// @notice Get the address of the tsbToken
    /// @param underlyingTokenId The token id of the underlying asset
    /// @param maturity The maturity of the tsbToken
    /// @return tsbTokenAddr The address of the tsbToken
    function getTsbTokenAddr(uint16 underlyingTokenId, uint32 maturity) external view returns (address tsbTokenAddr);

    /// @notice Get the address of the underlying asset of the tsbToken
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return underlyingAsset The address of the underlying asset of the tsbToken
    function getUnderlyingAsset(address tsbTokenAddr) external view returns (address underlyingAsset);

    /// @notice Get the maturity time of the tsbToken
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return maturityTime The maturity time of the tsbToken
    function getMaturityTime(address tsbTokenAddr) external view returns (uint32 maturityTime);
}
