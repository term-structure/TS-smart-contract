// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ProtocolParamsStorage, FundWeight, ProtocolFeeRecipient} from "./ProtocolParamsStorage.sol";

/**
 * @title Term Structure Protocol Params Library
 */
interface IProtocolParamsFacet {
    /// Error for setting invalid fund weight value
    error InvalidFundWeight(FundWeight fundWeight);
    /// @notice Error for trying to withdraw protocol to invalid recepient
    error InvalidFeeRecepient(address feeRecepient);

    /// @notice Emitted when the protocol fee is withdrawn
    /// @param receiver The address of the receiver
    /// @param token The token to be withdrawn
    /// @param amount The amount of the token to be withdrawn
    event ProtocolFeeWithdrawn(address indexed receiver, IERC20 token, uint256 amount);

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

    /// @notice Withdraw the protocol fee
    /// @param receiver The enum of the protocol fee recipient
    /// @param token The token to be withdrawn
    /// @param amount The amount of the token to be withdrawn
    function withdrawProtocolFee(ProtocolFeeRecipient receiver, IERC20 token, uint256 amount) external;

    /// @notice Set the treasury address
    /// @param treasuryAddr The address of the treasury
    function setTreasuryAddr(address payable treasuryAddr) external;

    /// @notice Set the insurance address
    /// @param insuranceAddr The address of the insurance
    function setInsuranceAddr(address payable insuranceAddr) external;

    /// @notice Set the vault address
    /// @param vaultAddr The address of the vault
    function setVaultAddr(address payable vaultAddr) external;

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
