// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IGovernance {
    /// @notice Emitted when the treasury address is set
    /// @param treasuryAddr The address of the treasury
    event SetTreasuryAddr(address indexed treasuryAddr);

    /// @notice Emitted when the insurance address is set
    /// @param insuranceAddr The address of the insurance
    event SetInsuranceAddr(address indexed insuranceAddr);

    /// @notice Emitted when the vault address is set
    /// @param vaultAddr The address of the vault
    event SetVaultAddr(address indexed vaultAddr);

    /// @notice Set the treasury address
    /// @param treasuryAddr The address of the treasury
    function setTreasuryAddr(address treasuryAddr) external;

    /// @notice Set the insurance address
    /// @param insuranceAddr The address of the insurance
    function setInsuranceAddr(address insuranceAddr) external;

    /// @notice Set the vault address
    /// @param vaultAddr The address of the vault
    function setVaultAddr(address vaultAddr) external;

    /// @notice Return the treasury address
    /// @return treasuryAddr The address of the treasury
    function getTreasuryAddr() external view returns (address);

    /// @notice Return the insurance address
    /// @return insuranceAddr The address of the insurance
    function getInsuranceAddr() external view returns (address);

    /// @notice Return the vault address
    /// @return vaultAddr The address of the vault
    function getVaultAddr() external view returns (address);
}
