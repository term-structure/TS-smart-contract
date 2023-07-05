// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ProtocolParamsStorage, FundWeight} from "./ProtocolParamsStorage.sol";

/**
 * @title Term Structure Protocol Params Library
 */
library ProtocolParamsLib {
    /// @notice Internal function to return the address of treasury
    /// @param s The protocol params storage
    /// @return treasuryAddr Address of treasury
    function getTreasuryAddr(ProtocolParamsStorage.Layout storage s) internal view returns (address payable) {
        return s.treasuryAddr;
    }

    /// @notice Internal function to return the address of insurance
    /// @param s The protocol params storage
    /// @return insuranceAddr Address of insurance
    function getInsuranceAddr(ProtocolParamsStorage.Layout storage s) internal view returns (address payable) {
        return s.insuranceAddr;
    }

    /// @notice Internal function to return the address of vault
    /// @param s The protocol params storage
    /// @return vaultAddr Address of vault
    function getVaultAddr(ProtocolParamsStorage.Layout storage s) internal view returns (address payable) {
        return s.vaultAddr;
    }

    /// @notice Internal function to return the fund weight
    /// @param s The protocol params storage
    /// @return fundWeight Fund weight
    function getFundWeight(ProtocolParamsStorage.Layout storage s) internal view returns (FundWeight memory) {
        return s.fundWeight;
    }

    /// @notice Internal function to get the protocol params storage layout
    /// @return protocolParamsStorage The protocol params storage layout
    function getProtocolParamsStorage() internal pure returns (ProtocolParamsStorage.Layout storage) {
        return ProtocolParamsStorage.layout();
    }
}
