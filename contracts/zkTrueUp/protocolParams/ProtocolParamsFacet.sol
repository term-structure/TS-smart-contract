// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {ProtocolParamsStorage, FundWeight} from "./ProtocolParamsStorage.sol";
import {IProtocolParamsFacet} from "./IProtocolParamsFacet.sol";
import {ProtocolParamsLib} from "./ProtocolParamsLib.sol";
import {Utils} from "../libraries/Utils.sol";
import {Config} from "../libraries/Config.sol";

/**
 * @title Term Structure Protocol Params Facet Contract
 */
contract ProtocolParamsFacet is IProtocolParamsFacet, AccessControlInternal {
    using ProtocolParamsLib for ProtocolParamsStorage.Layout;

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function setTreasuryAddr(address payable treasuryAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(treasuryAddr);
        ProtocolParamsStorage.layout().treasuryAddr = treasuryAddr;
        emit SetTreasuryAddr(treasuryAddr);
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function setInsuranceAddr(address payable insuranceAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(insuranceAddr);
        ProtocolParamsStorage.layout().insuranceAddr = insuranceAddr;
        emit SetInsuranceAddr(insuranceAddr);
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function setVaultAddr(address payable vaultAddr) external onlyRole(Config.ADMIN_ROLE) {
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
        return ProtocolParamsLib.getProtocolParamsStorage().getTreasuryAddr();
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function getInsuranceAddr() external view override returns (address) {
        return ProtocolParamsLib.getProtocolParamsStorage().getInsuranceAddr();
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function getVaultAddr() external view override returns (address) {
        return ProtocolParamsLib.getProtocolParamsStorage().getVaultAddr();
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function getFundWeight() external view override returns (FundWeight memory) {
        return ProtocolParamsLib.getProtocolParamsStorage().getFundWeight();
    }
}
