// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {GovernanceStorage, FundWeight} from "./GovernanceStorage.sol";
import {IGovernanceFacet} from "./IGovernanceFacet.sol";
import {GovernanceLib} from "./GovernanceLib.sol";
import {Checker} from "../libraries/Checker.sol";
import {Config} from "../libraries/Config.sol";

import "hardhat/console.sol";

contract GovernanceFacet is IGovernanceFacet, AccessControlInternal {
    using GovernanceStorage for GovernanceStorage.Layout;

    function setTreasuryAddr(address treasuryAddr) external onlyRole(Config.ADMIN_ROLE) {
        Checker.noneZeroAddr(treasuryAddr);
        GovernanceStorage.layout().treasuryAddr = treasuryAddr;
        emit SetTreasuryAddr(treasuryAddr);
    }

    function setInsuranceAddr(address insuranceAddr) external onlyRole(Config.ADMIN_ROLE) {
        Checker.noneZeroAddr(insuranceAddr);
        GovernanceStorage.layout().insuranceAddr = insuranceAddr;
        emit SetInsuranceAddr(insuranceAddr);
    }

    function setVaultAddr(address vaultAddr) external onlyRole(Config.ADMIN_ROLE) {
        Checker.noneZeroAddr(vaultAddr);
        GovernanceStorage.layout().vaultAddr = vaultAddr;
        emit SetVaultAddr(vaultAddr);
    }

    function setFundWeight(FundWeight memory fundWeight) external onlyRole(Config.ADMIN_ROLE) {
        if (fundWeight.treasury + fundWeight.insurance + fundWeight.vault != Config.FUND_WEIGHT_BASE)
            revert InvalidFundWeight();
        GovernanceStorage.layout().fundWeight = fundWeight;
        emit SetFundWeight(fundWeight);
    }

    function getTreasuryAddr() external view override returns (address) {
        return GovernanceLib.getTreasuryAddr();
    }

    function getInsuranceAddr() external view override returns (address) {
        return GovernanceLib.getInsuranceAddr();
    }

    function getVaultAddr() external view override returns (address) {
        return GovernanceLib.getVaultAddr();
    }

    function getFundWeight() external view override returns (FundWeight memory) {
        return GovernanceLib.getFundWeight();
    }
}
