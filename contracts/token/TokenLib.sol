// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ISolidStateERC20} from "@solidstate/contracts/token/ERC20/ISolidStateERC20.sol";
import {SafeERC20} from "@solidstate/contracts/utils/SafeERC20.sol";
import {SafeCast} from "@solidstate/contracts/utils/SafeCast.sol";
import {TokenStorage, AssetConfig} from "./TokenStorage.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {Config} from "../libraries/Config.sol";

library TokenLib {
    using SafeERC20 for ISolidStateERC20;

    /// @notice Error for transfer
    error TransferFailed();
    /// @notice Error for invalid msg.value
    error InvalidMsgValue(uint256 msgValue);
    /// @notice Error for inconsistent amount
    error AmountInconsistent(uint128 transferredAmt, uint128 expectedAmt);
    /// @notice Error for get invalid token which is paused
    error TokenIsPaused(address pausedTokenAddr);
    /// @notice Error for get token which is not whitelisted
    error TokenIsNotExist(address notWhitelistedTokenAddr);
    /// @notice Error for deposit amount is invalid
    error InvalidDepositAmt(uint128 depositAmt);

    /// @notice Internal transfer function
    /// @dev Mutated transfer function to handle the case of ETH and ERC20
    /// @param tokenAddr The address of the token to be transferred
    /// @param receiver The address of receiver
    /// @param amount The amount of the token
    function transfer(address tokenAddr, address payable receiver, uint128 amount) internal {
        if (tokenAddr == Config.ETH_ADDRESS) {
            IWETH(AddressLib.getWETHAddr()).withdraw(amount);
            (bool success, ) = receiver.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            ISolidStateERC20(tokenAddr).safeTransfer(receiver, amount);
        }
    }

    /// @notice Internal transferFrom function
    /// @dev Mutated transferFrom function to handle the case of ETH and ERC20 to zkTrueUp contract
    /// @param tokenAddr The address of the token to be transferred
    /// @param sender The address of sender
    /// @param amount The amount of the token
    /// @param msgValue The msg.value
    function transferFrom(address tokenAddr, address sender, uint128 amount, uint256 msgValue) internal {
        if (tokenAddr == Config.ETH_ADDRESS) {
            if (msgValue != amount) revert InvalidMsgValue(msgValue);
            IWETH(AddressLib.getWETHAddr()).deposit{value: amount}();
        } else {
            if (msgValue != 0) revert InvalidMsgValue(msgValue);
            ISolidStateERC20 token = ISolidStateERC20(tokenAddr);
            uint256 balanceBefore = token.balanceOf(address(this));
            token.safeTransferFrom(sender, address(this), amount);
            uint256 balanceAfter = token.balanceOf(address(this));
            uint128 transferredAmt = SafeCast.toUint128(balanceAfter - balanceBefore);
            if (transferredAmt != amount) revert AmountInconsistent(transferredAmt, amount);
        }
    }

    /// @notice Internal function to check if the deposit amount is valid
    /// @param depositAmt The deposit amount to be checked
    /// @param assetConfig The configuration of the token
    function validDepositAmt(uint128 depositAmt, AssetConfig memory assetConfig) internal pure {
        if (depositAmt < assetConfig.minDepositAmt) revert InvalidDepositAmt(depositAmt);
    }

    /// @notice Return the total number of the registered tokens
    /// @return tokenNum The total number of the registered tokens
    function getTokenNum() internal view returns (uint16) {
        return TokenStorage.layout().tokenNum;
    }

    /// @notice Return the valid Layer2 token address and the configuration of the token
    /// @dev The L1 token address of a valid token cannot be 0 address and the token can not be paused
    /// @param tokenAddr The token address on Layer1
    /// @return tokenId The token id on Layer2
    /// @return assetConfig The configuration of the token
    function getValidToken(address tokenAddr) internal view returns (uint16, AssetConfig memory) {
        tokenAddr = tokenAddr == AddressLib.getWETHAddr() ? Config.ETH_ADDRESS : tokenAddr;
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        bool isTokenPaused = tsl.isPaused[tokenAddr];
        if (isTokenPaused) revert TokenIsPaused(tokenAddr);
        uint16 tokenId = getValidTokenId(tokenAddr);
        AssetConfig memory assetConfig = tsl.assetConfigs[tokenId];
        return (tokenId, assetConfig);
    }

    /// @notice Get valid token id by l1 token address
    /// @param tokenAddr The token address on Layer1
    /// @return tokenId The token id on Layer2
    function getValidTokenId(address tokenAddr) internal view returns (uint16) {
        uint16 tokenId = TokenStorage.layout().tokenIds[tokenAddr];
        if (tokenId == 0) revert TokenIsNotExist(tokenAddr);
        return tokenId;
    }

    function getAssetConfig(uint16 tokenId) internal view returns (AssetConfig memory) {
        return TokenStorage.layout().assetConfigs[tokenId];
    }

    function getAssetConfig(address tokenAddr) internal view returns (uint16, AssetConfig memory) {
        uint16 tokenId = getTokenId(tokenAddr);
        return (tokenId, TokenStorage.layout().assetConfigs[tokenId]);
    }

    /// @notice Return the Layer2 token address of the Layer1 token
    /// @param tokenAddr The token address on Layer1
    /// @return tokenId The token id on Layer2
    function getTokenId(address tokenAddr) internal view returns (uint16) {
        return TokenStorage.layout().tokenIds[tokenAddr];
    }

    function isPaused(address tokenAddr) internal view returns (bool) {
        return TokenStorage.layout().isPaused[tokenAddr];
    }
}
