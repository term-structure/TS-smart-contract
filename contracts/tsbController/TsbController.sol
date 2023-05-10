// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {TokenInternal} from "../token/TokenInternal.sol";
import {TsbToken} from "../TsbToken.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {Config} from "../libraries/Config.sol";
import {TsbControllerStorage} from "./TsbControllerStorage.sol";
import {TsbControllerInternal} from "./TsbControllerInternal.sol";
import {ITsbController} from "./ITsbController.sol";

contract TsbController is ITsbController, AccessControlInternal, TokenInternal, TsbControllerInternal {
    /// @notice Create a new tsbToken
    /// @dev This function is called by governance
    /// @param underlyingTokenId The token id of the underlying asset
    /// @param maturityTime The maturity time of the tsbToken
    /// @param name The name of the tsbToken
    /// @param symbol The symbol of the tsbToken
    /// @return tsbTokenAddr The address of the tsbToken
    //! virtual for test
    function createTsbToken(
        uint16 underlyingTokenId,
        uint32 maturityTime,
        string memory name,
        string memory symbol
    ) external virtual onlyRole(Config.OPERATOR_ROLE) returns (address) {
        if (maturityTime <= block.timestamp) revert InvalidMaturityTime(maturityTime);
        address underlyingAssetAddr = _getAssetConfig(underlyingTokenId).tokenAddr;
        if (underlyingAssetAddr == address(0)) revert UnderlyingAssetIsNotExist(underlyingTokenId);
        uint48 tsbTokenKey = _getTsbTokenKey(underlyingTokenId, maturityTime);
        address tokenAddr = _getTsbTokenAddr(tsbTokenKey);
        if (tokenAddr != address(0)) revert TsbTokenIsExist(tokenAddr);
        address tsbTokenAddr = address(new TsbToken(name, symbol, underlyingAssetAddr, maturityTime));
        TsbControllerStorage.layout().tsbTokens[tsbTokenKey] = tsbTokenAddr;
        emit TsbTokenCreated(tsbTokenAddr, underlyingTokenId, maturityTime);
        return tsbTokenAddr;
    }

    /// @notice Mint tsbToken
    /// @dev This function can only be called by zkTrueUp
    /// @param tsbTokenAddr The address of the tsbToken
    /// @param to The address of the recipient
    /// @param amount The amount of the tsbToken
    function mintTsbToken(address tsbTokenAddr, address to, uint128 amount) external onlyRole(Config.OPERATOR_ROLE) {
        ITsbToken(tsbTokenAddr).mint(to, amount);
        emit TsbTokenMinted(tsbTokenAddr, to, amount);
    }

    /// @notice Burn tsbToken
    /// @dev This function can only be called by zkTrueUp
    /// @param tsbTokenAddr The address of the tsbToken
    /// @param from The address of the sender
    /// @param amount The amount of the tsbToken to burn
    function burnTsbToken(address tsbTokenAddr, address from, uint128 amount) external onlyRole(Config.OPERATOR_ROLE) {
        ITsbToken(tsbTokenAddr).burn(from, amount);
        emit TsbTokenBurned(tsbTokenAddr, from, amount);
    }

    /* ========== External View Functions ========== */

    /// @notice Check the balance of the tsbToken
    /// @param account The address of the account
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return balance The balance of the tsbToken
    function balanceOf(address account, address tsbTokenAddr) external view returns (uint256) {
        return ITsbToken(tsbTokenAddr).balanceOf(account);
    }

    /// @notice Check the allowance of the tsbToken
    /// @param owner The address of the owner
    /// @param spender The address of the spender
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return allowance_ The allowance of the tsbToken
    function allowance(address owner, address spender, address tsbTokenAddr) external view returns (uint256) {
        return ITsbToken(tsbTokenAddr).allowance(owner, spender);
    }

    /// @notice Check the total supply of the tsbToken
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return totalSupply The total supply of the tsbToken
    function activeSupply(address tsbTokenAddr) external view returns (uint256) {
        return ITsbToken(tsbTokenAddr).totalSupply();
    }

    /// @notice Get the address of the underlying asset of the tsbToken
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return underlyingAsset The address of the underlying asset of the tsbToken
    function getUnderlyingAsset(address tsbTokenAddr) external view returns (address) {
        return ITsbToken(tsbTokenAddr).underlyingAsset();
    }

    /// @notice Get the maturity time of the tsbToken
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return maturityTime The maturity time of the tsbToken
    function getMaturityTime(address tsbTokenAddr) external view returns (uint32) {
        return ITsbToken(tsbTokenAddr).maturityTime();
    }

    /// @notice Get the address of the tsbToken
    /// @param underlyingTokenId The token id of the underlying asset
    /// @param maturity The maturity of the tsbToken
    /// @return tsbTokenAddr The address of the tsbToken
    function getTsbTokenAddr(uint16 underlyingTokenId, uint32 maturity) external view returns (address tsbTokenAddr) {
        return _getTsbTokenAddr(_getTsbTokenKey(underlyingTokenId, maturity));
    }
}
