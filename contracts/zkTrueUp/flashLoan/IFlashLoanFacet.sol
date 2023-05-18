// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IFlashLoanFacet {
    /// @notice Error for input length mismatch in flash loan function
    error InputLengthMismatch(uint256 assetLength, uint256 amountLength);
    /// @notice Error for fail to execute flash loan
    error FlashLoanExecuteFailed();

    /// @notice Emitted when the flash loan is executed
    /// @param sender The address of the sender
    /// @param receiver The address of the receiver
    /// @param asset The address of the asset
    /// @param amount The amount of the asset
    /// @param premium The premium of the flash loan
    event FlashLoan(
        address indexed sender,
        address indexed receiver,
        address indexed asset,
        uint128 amount,
        uint128 premium
    );

    /// @notice Emitted when the flash loan premium is set
    /// @param flashLoanPremium The flash loan premium
    event SetFlashLoanPremium(uint16 indexed flashLoanPremium);

    /// @notice Flash loan
    /// @param receiver The address of the receiver
    /// @param assets The addresses of the assets
    /// @param amounts The amounts of the assets
    /// @param data The data that will be passed to the receiver
    function flashLoan(
        address payable receiver,
        address[] calldata assets,
        uint128[] calldata amounts,
        bytes calldata data
    ) external;

    /// @notice Set the flash loan premium
    /// @param flashLoanPremium The flash loan premium
    function setFlashLoanPremium(uint16 flashLoanPremium) external;

    /// @notice Get the flash loan premium
    /// @return flashLoanPremium The flash loan premium
    function getFlashLoanPremium() external view returns (uint16 flashLoanPremium);
}
