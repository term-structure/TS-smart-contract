// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {GovernanceStorage, FundWeight} from "../governance/GovernanceStorage.sol";

library GovernanceLib {
    function getTreasuryAddr() external view returns (address) {
        return GovernanceStorage.layout().treasuryAddr;
    }

    function getInsuranceAddr() external view returns (address) {
        return GovernanceStorage.layout().insuranceAddr;
    }

    function getVaultAddr() external view returns (address) {
        return GovernanceStorage.layout().vaultAddr;
    }

    function getFundWeight() external view returns (FundWeight memory) {
        return GovernanceStorage.layout().fundWeight;
    }
}
