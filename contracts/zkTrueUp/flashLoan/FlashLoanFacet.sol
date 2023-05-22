// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {ISolidStateERC20} from "@solidstate/contracts/token/ERC20/ISolidStateERC20.sol";
import {SafeERC20} from "@solidstate/contracts/utils/SafeERC20.sol";
import {FlashLoanStorage} from "./FlashLoanStorage.sol";
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
    using SafeERC20 for ISolidStateERC20;

    /**
     * @inheritdoc IFlashLoanFacet
     * @notice The flash loan function is used to borrow tokens from ZkTrueUp
     * @notice The borrower must repay the borrowed tokens and the premium to ZkTrueUp
     * @notice The flash loan function is borrow WETH instead of ETH
     */
    function flashLoan(
        address payable receiver,
        address[] memory assets,
        uint128[] memory amounts,
        bytes memory data
    ) external {
        if (assets.length != amounts.length) revert InputLengthMismatch(assets.length, amounts.length);
        uint16 flashLoanPremium = FlashLoanLib.getFlashLoanPremium();
        uint128[] memory premiums = new uint128[](assets.length);
        for (uint256 i; i < assets.length; i++) {
            TokenLib.getValidToken(assets[i]);
            premiums[i] = (amounts[i] * flashLoanPremium) / Config.FLASH_LOAN_PREMIUM_BASE;
            ISolidStateERC20(assets[i]).safeTransfer(receiver, amounts[i]);
        }

        if (!IFlashLoanReceiver(receiver).executeOperation(msg.sender, assets, amounts, premiums, data))
            revert FlashLoanExecuteFailed();

        address treasuryAddr = ProtocolParamsLib.getTreasuryAddr();
        for (uint256 i; i < assets.length; i++) {
            ISolidStateERC20(assets[i]).safeTransferFrom(receiver, address(this), amounts[i] + premiums[i]);
            ISolidStateERC20(assets[i]).safeTransfer(treasuryAddr, premiums[i]);
            emit FlashLoan(msg.sender, receiver, assets[i], amounts[i], premiums[i]);
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
        return FlashLoanLib.getFlashLoanPremium();
    }
}
