// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {TsbToken} from "../TsbToken.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {Config} from "../libraries/Config.sol";
import {TsbStorage} from "./TsbStorage.sol";
import {TsbLib} from "./TsbLib.sol";
import {ITsbFacet} from "./ITsbFacet.sol";

contract TsbFacet is ITsbFacet, AccessControlInternal, ReentrancyGuard {
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
        address underlyingAssetAddr = TokenLib.getAssetConfig(underlyingTokenId).tokenAddr;
        if (underlyingAssetAddr == address(0)) revert UnderlyingAssetIsNotExist(underlyingTokenId);
        uint48 tsbTokenKey = TsbLib.getTsbTokenKey(underlyingTokenId, maturityTime);
        address tokenAddr = TsbLib.getTsbTokenAddr(tsbTokenKey);
        if (tokenAddr != address(0)) revert TsbTokenIsExist(tokenAddr);
        address tsbTokenAddr = address(new TsbToken(name, symbol, underlyingAssetAddr, maturityTime));
        TsbStorage.layout().tsbTokens[tsbTokenKey] = tsbTokenAddr;
        emit TsbTokenCreated(tsbTokenAddr, underlyingTokenId, maturityTime);
        return tsbTokenAddr;
    }

    /// @notice Redeem tsbToken
    /// @dev TSB token can be redeemed only after maturity
    /// @param tsbTokenAddr The address of the tsbToken
    /// @param amount The amount of the tsbToken
    /// @param redeemAndDeposit Whether to deposit the underlying asset after redeem the tsbToken
    function redeem(address tsbTokenAddr, uint128 amount, bool redeemAndDeposit) external nonReentrant {
        (, AssetConfig memory assetConfig) = TokenLib.getAssetConfig(tsbTokenAddr);
        if (!assetConfig.isTsbToken) revert InvalidTsbTokenAddr(tsbTokenAddr);
        (address underlyingAsset, uint32 maturityTime) = ITsbToken(tsbTokenAddr).tokenInfo();
        if (block.timestamp < maturityTime) revert TsbTokenIsNotMatured(tsbTokenAddr);

        TsbLib.burnTsbToken(tsbTokenAddr, msg.sender, amount);
        emit Redeem(msg.sender, tsbTokenAddr, underlyingAsset, amount, redeemAndDeposit);

        if (redeemAndDeposit) {
            uint32 accountId = AccountLib.getValidAccount(msg.sender);
            (uint16 tokenId, AssetConfig memory underlyingAssetConfig) = TokenLib.getValidToken(underlyingAsset);
            TokenLib.validDepositAmt(amount, underlyingAssetConfig);
            RollupLib.addDepositRequest(msg.sender, accountId, tokenId, underlyingAssetConfig.decimals, amount);
        } else {
            TokenLib.transfer(underlyingAsset, payable(msg.sender), amount);
        }
    }

    /* ========== External View Functions ========== */

    /// @notice Get the address of the tsbToken
    /// @param underlyingTokenId The token id of the underlying asset
    /// @param maturity The maturity of the tsbToken
    /// @return tsbTokenAddr The address of the tsbToken
    function getTsbTokenAddr(uint16 underlyingTokenId, uint32 maturity) external view returns (address) {
        return TsbLib.getTsbTokenAddr(TsbLib.getTsbTokenKey(underlyingTokenId, maturity));
    }

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
        (address underlyingAsset, ) = ITsbToken(tsbTokenAddr).tokenInfo();
        return underlyingAsset;
    }

    /// @notice Get the maturity time of the tsbToken
    /// @param tsbTokenAddr The address of the tsbToken
    /// @return maturityTime The maturity time of the tsbToken
    function getMaturityTime(address tsbTokenAddr) external view returns (uint32) {
        (, uint32 maturityTime) = ITsbToken(tsbTokenAddr).tokenInfo();
        return maturityTime;
    }
}
