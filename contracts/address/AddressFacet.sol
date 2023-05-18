// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {AddressStorage} from "./AddressStorage.sol";
import {IAddressFacet} from "./IAddressFacet.sol";
import {AddressLib} from "./AddressLib.sol";
import {Utils} from "../libraries/Utils.sol";
import {Config} from "../libraries/Config.sol";

contract AddressFacet is IAddressFacet, AccessControlInternal {
    function setVerifierAddr(address newVerifierAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(newVerifierAddr);
        AddressStorage.layout().verifierAddr = newVerifierAddr;
    }

    function setEvacuVerifierAddr(address newEvacuVerifierAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.noneZeroAddr(newEvacuVerifierAddr);
        AddressStorage.layout().evacuVerifierAddr = newEvacuVerifierAddr;
    }

    function getWETHAddr() external view returns (address) {
        return AddressLib.getWETHAddr();
    }

    function getPoseidonUnit2Addr() external view returns (address) {
        return AddressLib.getPoseidonUnit2Addr();
    }

    function getVerifierAddr() external view returns (address) {
        return AddressLib.getVerifierAddr();
    }

    function getEvacuVerifierAddr() external view returns (address) {
        return AddressLib.getEvacuVerifierAddr();
    }
}
