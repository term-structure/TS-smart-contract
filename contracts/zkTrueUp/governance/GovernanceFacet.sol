// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {GovernanceStorage, FundWeight} from "./GovernanceStorage.sol";
import {IGovernanceFacet} from "./IGovernanceFacet.sol";
import {GovernanceLib} from "./GovernanceLib.sol";
import {Utils} from "../libraries/Utils.sol";
import {Config} from "../libraries/Config.sol";

contract GovernanceFacet is IGovernanceFacet, AccessControlInternal {
    /**
     * @inheritdoc IGovernanceFacet
     */
    function setTreasuryAddr(address treasuryAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(treasuryAddr);
        GovernanceStorage.layout().treasuryAddr = treasuryAddr;
        emit SetTreasuryAddr(treasuryAddr);
    }

    /**
     * @inheritdoc IGovernanceFacet
     */
    function setInsuranceAddr(address insuranceAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(insuranceAddr);
        GovernanceStorage.layout().insuranceAddr = insuranceAddr;
        emit SetInsuranceAddr(insuranceAddr);
    }

    /**
     * @inheritdoc IGovernanceFacet
     */
    function setVaultAddr(address vaultAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(vaultAddr);
        GovernanceStorage.layout().vaultAddr = vaultAddr;
        emit SetVaultAddr(vaultAddr);
    }

    /**
     * @inheritdoc IGovernanceFacet
     */
    function setFundWeight(FundWeight memory fundWeight) external onlyRole(Config.ADMIN_ROLE) {
        if (fundWeight.treasury + fundWeight.insurance + fundWeight.vault != Config.FUND_WEIGHT_BASE)
            revert InvalidFundWeight();
        GovernanceStorage.layout().fundWeight = fundWeight;
        emit SetFundWeight(fundWeight);
    }

    /**
     * @inheritdoc IGovernanceFacet
     */
    function getTreasuryAddr() external view override returns (address) {
        return GovernanceLib.getTreasuryAddr();
    }

    /**
     * @inheritdoc IGovernanceFacet
     */
    function getInsuranceAddr() external view override returns (address) {
        return GovernanceLib.getInsuranceAddr();
    }

    /**
     * @inheritdoc IGovernanceFacet
     */
    function getVaultAddr() external view override returns (address) {
        return GovernanceLib.getVaultAddr();
    }

    /**
     * @inheritdoc IGovernanceFacet
     */
    function getFundWeight() external view override returns (FundWeight memory) {
        return GovernanceLib.getFundWeight();
    }
}
