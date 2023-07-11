// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Term Structure Flash Loan Facet Interface
 */
interface IFlashLoanFacet {
    /// @notice Error for input length mismatch in flash loan function
    error InputLengthMismatch(uint256 assetLength, uint256 amountLength);
    /// @notice Error for fail to execute operation in flash loan function
    error ExecuteOperationFailedLogString(string err);
    /// @notice Error for fail to execute operation in flash loan function
    error ExecuteOperationFailedLogBytes(bytes err);

    /// @notice Emitted when the flash loan is executed
    /// @param sender The address of the sender
    /// @param receiver The address of the receiver
    /// @param asset The assets of the flash loan
    /// @param amount The amount of the asset
    /// @param premium The premium of the flash loan
    event FlashLoan(
        address indexed sender,
        address indexed receiver,
        IERC20 indexed asset,
        uint256 amount,
        uint256 premium
    );

    /// @notice Emitted when the flash loan premium is set
    /// @param flashLoanPremium The flash loan premium
    event SetFlashLoanPremium(uint16 indexed flashLoanPremium);

    /// @notice Flash loan
    /// @param receiver The address of the receiver
    /// @param assets The assets of the flash loan
    /// @param amounts The amounts of the assets
    /// @param data The data that will be passed to the receiver
    function flashLoan(
        address payable receiver,
        IERC20[] calldata assets,
        uint256[] calldata amounts,
        bytes calldata data
    ) external;

    /// @notice Set the flash loan premium
    /// @param flashLoanPremium The flash loan premium
    function setFlashLoanPremium(uint16 flashLoanPremium) external;

    /// @notice Get the flash loan premium
    /// @return flashLoanPremium The flash loan premium
    function getFlashLoanPremium() external view returns (uint16 flashLoanPremium);
}
