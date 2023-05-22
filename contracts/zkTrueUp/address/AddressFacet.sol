// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {AddressStorage} from "./AddressStorage.sol";
import {IAddressFacet} from "./IAddressFacet.sol";
import {AddressLib} from "./AddressLib.sol";
import {Utils} from "../libraries/Utils.sol";
import {Config} from "../libraries/Config.sol";

/**
 * @title Term Structure Address Facet Contract
 */
contract AddressFacet is IAddressFacet, AccessControlInternal {
    /**
     * @inheritdoc IAddressFacet
     */
    function setVerifierAddr(address newVerifierAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(newVerifierAddr);
        AddressStorage.layout().verifierAddr = newVerifierAddr;
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function setEvacuVerifierAddr(address newEvacuVerifierAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(newEvacuVerifierAddr);
        AddressStorage.layout().evacuVerifierAddr = newEvacuVerifierAddr;
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function getWETHAddr() external view returns (address wethAddr) {
        return AddressLib.getWETHAddr();
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function getPoseidonUnit2Addr() external view returns (address poseidonUnit2Addr) {
        return AddressLib.getPoseidonUnit2Addr();
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function getVerifierAddr() external view returns (address verifierAddr) {
        return AddressLib.getVerifierAddr();
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function getEvacuVerifierAddr() external view returns (address evacuVerifierAddr) {
        return AddressLib.getEvacuVerifierAddr();
    }
}
