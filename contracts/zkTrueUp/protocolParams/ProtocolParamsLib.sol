// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ProtocolParamsStorage, FundWeight} from "./ProtocolParamsStorage.sol";

/**
 * @title Term Structure Protocol Params Library
 */
library ProtocolParamsLib {
    /// @notice Internal function to return the address of treasury
    /// @return treasuryAddr Address of treasury
    function getTreasuryAddr() internal view returns (address) {
        return ProtocolParamsStorage.layout().treasuryAddr;
    }

    /// @notice Internal function to return the address of insurance
    /// @return insuranceAddr Address of insurance
    function getInsuranceAddr() internal view returns (address) {
        return ProtocolParamsStorage.layout().insuranceAddr;
    }

    /// @notice Internal function to return the address of vault
    /// @return vaultAddr Address of vault
    function getVaultAddr() internal view returns (address) {
        return ProtocolParamsStorage.layout().vaultAddr;
    }

    /// @notice Internal function to return the fund weight
    /// @return fundWeight Fund weight
    function getFundWeight() internal view returns (FundWeight memory) {
        return ProtocolParamsStorage.layout().fundWeight;
    }
}
