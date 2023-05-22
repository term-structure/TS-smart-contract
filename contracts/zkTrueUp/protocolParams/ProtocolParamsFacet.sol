// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {ProtocolParamsStorage, FundWeight} from "./ProtocolParamsStorage.sol";
import {IProtocolParamsFacet} from "./IProtocolParamsFacet.sol";
import {ProtocolParamsLib} from "./ProtocolParamsLib.sol";
import {Utils} from "../libraries/Utils.sol";
import {Config} from "../libraries/Config.sol";

contract ProtocolParamsFacet is IProtocolParamsFacet, AccessControlInternal {
    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function setTreasuryAddr(address treasuryAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(treasuryAddr);
        ProtocolParamsStorage.layout().treasuryAddr = treasuryAddr;
        emit SetTreasuryAddr(treasuryAddr);
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function setInsuranceAddr(address insuranceAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(insuranceAddr);
        ProtocolParamsStorage.layout().insuranceAddr = insuranceAddr;
        emit SetInsuranceAddr(insuranceAddr);
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function setVaultAddr(address vaultAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(vaultAddr);
        ProtocolParamsStorage.layout().vaultAddr = vaultAddr;
        emit SetVaultAddr(vaultAddr);
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function setFundWeight(FundWeight memory fundWeight) external onlyRole(Config.ADMIN_ROLE) {
        if (fundWeight.treasury + fundWeight.insurance + fundWeight.vault != Config.FUND_WEIGHT_BASE)
            revert InvalidFundWeight();
        ProtocolParamsStorage.layout().fundWeight = fundWeight;
        emit SetFundWeight(fundWeight);
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function getTreasuryAddr() external view override returns (address) {
        return ProtocolParamsLib.getTreasuryAddr();
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function getInsuranceAddr() external view override returns (address) {
        return ProtocolParamsLib.getInsuranceAddr();
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function getVaultAddr() external view override returns (address) {
        return ProtocolParamsLib.getVaultAddr();
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function getFundWeight() external view override returns (FundWeight memory) {
        return ProtocolParamsLib.getFundWeight();
    }
}
