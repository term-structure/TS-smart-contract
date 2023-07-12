// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {FlashLoanStorage} from "./FlashLoanStorage.sol";
import {ProtocolParamsStorage} from "../protocolParams/ProtocolParamsStorage.sol";
import {TokenStorage} from "../token/TokenStorage.sol";
import {FlashLoanLib} from "./FlashLoanLib.sol";
import {IFlashLoanFacet} from "./IFlashLoanFacet.sol";
import {IFlashLoanReceiver} from "../interfaces/IFlashLoanReceiver.sol";
import {ProtocolParamsLib} from "../protocolParams/ProtocolParamsLib.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {Config} from "../libraries/Config.sol";

/**
 * @title Term Structure Flash Loan Facet Contract
 */
contract FlashLoanFacet is AccessControlInternal, IFlashLoanFacet {
    using Math for uint256;
    using SafeERC20 for IERC20;
    using FlashLoanLib for FlashLoanStorage.Layout;
    using ProtocolParamsLib for ProtocolParamsStorage.Layout;
    using TokenLib for TokenStorage.Layout;

    /**
     * @inheritdoc IFlashLoanFacet
     * @notice The flash loan function is used to borrow tokens from ZkTrueUp
     * @notice The borrower must repay the borrowed tokens and the premium to ZkTrueUp
     * @notice The flash loan function is borrow WETH instead of ETH
     */
    function flashLoan(
        address payable receiver,
        IERC20[] memory assets,
        uint256[] memory amounts,
        bytes memory data
    ) external {
        if (assets.length != amounts.length) revert InputLengthMismatch(assets.length, amounts.length);
        uint16 flashLoanPremium = FlashLoanStorage.layout().getFlashLoanPremium();
        uint256[] memory premiums = new uint256[](assets.length);
        for (uint256 i; i < assets.length; i++) {
            TokenStorage.layout().getValidToken(assets[i]);
            premiums[i] = amounts[i].mulDiv(flashLoanPremium, Config.FLASH_LOAN_PREMIUM_BASE);
            assets[i].safeTransfer(receiver, amounts[i]);
        }

        try IFlashLoanReceiver(receiver).executeOperation(msg.sender, assets, amounts, premiums, data) {
            address payable treasuryAddr = ProtocolParamsStorage.layout().getTreasuryAddr();
            for (uint256 i; i < assets.length; i++) {
                assets[i].safeTransferFrom(receiver, address(this), amounts[i] + premiums[i]);
                assets[i].safeTransfer(treasuryAddr, premiums[i]);
                emit FlashLoan(msg.sender, receiver, assets[i], amounts[i], premiums[i]);
            }
        } catch Error(string memory err) {
            revert ExecuteOperationFailedLogString(err);
        } catch (bytes memory err) {
            revert ExecuteOperationFailedLogBytes(err);
        }
    }

    /**
     * @inheritdoc IFlashLoanFacet
     */
    function setFlashLoanPremium(uint16 flashLoanPremium) external onlyRole(Config.ADMIN_ROLE) {
        FlashLoanStorage.layout().flashLoanPremium = flashLoanPremium;
        emit SetFlashLoanPremium(flashLoanPremium);
    }

    /**
     * @inheritdoc IFlashLoanFacet
     */
    function getFlashLoanPremium() external view returns (uint16) {
        return FlashLoanStorage.layout().getFlashLoanPremium();
    }
}
