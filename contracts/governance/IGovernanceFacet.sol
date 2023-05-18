// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {GovernanceStorage, FundWeight} from "./GovernanceStorage.sol";

interface IGovernanceFacet {
    /// Error for setting invalid fund weight value
    error InvalidFundWeight();

    /// @notice Emitted when the treasury address is set
    /// @param treasuryAddr The address of the treasury
    event SetTreasuryAddr(address indexed treasuryAddr);

    /// @notice Emitted when the insurance address is set
    /// @param insuranceAddr The address of the insurance
    event SetInsuranceAddr(address indexed insuranceAddr);

    /// @notice Emitted when the vault address is set
    /// @param vaultAddr The address of the vault
    event SetVaultAddr(address indexed vaultAddr);

    /// @notice Emitted when the fund weight is set
    /// @param fundWeight The fund weight
    event SetFundWeight(FundWeight indexed fundWeight);

    /// @notice Set the treasury address
    /// @param treasuryAddr The address of the treasury
    function setTreasuryAddr(address treasuryAddr) external;

    /// @notice Set the insurance address
    /// @param insuranceAddr The address of the insurance
    function setInsuranceAddr(address insuranceAddr) external;

    /// @notice Set the vault address
    /// @param vaultAddr The address of the vault
    function setVaultAddr(address vaultAddr) external;

    /// @notice Set the fund weight
    /// @param fundWeight The fund weight
    function setFundWeight(FundWeight memory fundWeight) external;

    /// @notice Get the treasury address
    /// @return treasuryAddr The address of the treasury
    function getTreasuryAddr() external view returns (address treasuryAddr);

    /// @notice Get the insurance address
    /// @return insuranceAddr The address of the insurance
    function getInsuranceAddr() external view returns (address insuranceAddr);

    /// @notice Get the vault address
    /// @return vaultAddr The address of the vault
    function getVaultAddr() external view returns (address vaultAddr);

    /// @notice Get the fund weight
    /// @return fundWeight The fund weight
    function getFundWeight() external view returns (FundWeight memory fundWeight);
}
