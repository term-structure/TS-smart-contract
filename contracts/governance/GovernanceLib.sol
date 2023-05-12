// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {GovernanceStorage, FundWeight} from "./GovernanceStorage.sol";

library GovernanceLib {
    function getTreasuryAddr() internal view returns (address) {
        return GovernanceStorage.layout().treasuryAddr;
    }

    function getInsuranceAddr() internal view returns (address) {
        return GovernanceStorage.layout().insuranceAddr;
    }

    function getVaultAddr() internal view returns (address) {
        return GovernanceStorage.layout().vaultAddr;
    }

    function getFundWeight() internal view returns (FundWeight memory) {
        return GovernanceStorage.layout().fundWeight;
    }
}
