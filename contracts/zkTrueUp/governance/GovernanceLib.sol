// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {GovernanceStorage, FundWeight} from "./GovernanceStorage.sol";

library GovernanceLib {
    /// @notice Internal function to return the address of treasury
    /// @return treasuryAddr Address of treasury
    function getTreasuryAddr() internal view returns (address) {
        return GovernanceStorage.layout().treasuryAddr;
    }

    /// @notice Internal function to return the address of insurance
    /// @return insuranceAddr Address of insurance
    function getInsuranceAddr() internal view returns (address) {
        return GovernanceStorage.layout().insuranceAddr;
    }

    /// @notice Internal function to return the address of vault
    /// @return vaultAddr Address of vault
    function getVaultAddr() internal view returns (address) {
        return GovernanceStorage.layout().vaultAddr;
    }

    /// @notice Internal function to return the fund weight
    /// @return fundWeight Fund weight
    function getFundWeight() internal view returns (FundWeight memory) {
        return GovernanceStorage.layout().fundWeight;
    }
}
