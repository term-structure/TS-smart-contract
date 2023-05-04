// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControl} from "@solidstate/contracts/access/access_control/AccessControl.sol";
import {GovernanceStorage} from "./GovernanceStorage.sol";
import {IGovernance} from "./IGovernance.sol";
import {Checker} from "../libs/Checker.sol";
import {Config} from "../libs/Config.sol";

import "hardhat/console.sol";

contract Governance is IGovernance, AccessControl {
    using GovernanceStorage for GovernanceStorage.Layout;

    function setTreasuryAddr(address treasuryAddr) external onlyRole(Config.ADMIN_ROLE) {
        Checker.noneZeroAddr(treasuryAddr);
        GovernanceStorage.layout().setTreasuryAddr(treasuryAddr);
        emit SetTreasuryAddr(treasuryAddr);
    }

    function setInsuranceAddr(address insuranceAddr) external onlyRole(Config.ADMIN_ROLE) {
        Checker.noneZeroAddr(insuranceAddr);
        GovernanceStorage.layout().setInsuranceAddr(insuranceAddr);
        emit SetInsuranceAddr(insuranceAddr);
    }

    function setVaultAddr(address vaultAddr) external onlyRole(Config.ADMIN_ROLE) {
        Checker.noneZeroAddr(vaultAddr);
        GovernanceStorage.layout().setVaultAddr(vaultAddr);
        emit SetVaultAddr(vaultAddr);
    }

    function getTreasuryAddr() external view returns (address) {
        return GovernanceStorage.layout().getTreasuryAddr();
    }

    function getInsuranceAddr() external view returns (address) {
        return GovernanceStorage.layout().getInsuranceAddr();
    }

    function getVaultAddr() external view returns (address) {
        return GovernanceStorage.layout().getVaultAddr();
    }
}
