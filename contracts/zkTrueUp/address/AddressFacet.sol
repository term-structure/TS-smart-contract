// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {AddressStorage} from "./AddressStorage.sol";
import {IAddressFacet} from "./IAddressFacet.sol";
import {AddressLib} from "./AddressLib.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {IPoseidonUnit2} from "../interfaces/IPoseidonUnit2.sol";
import {IVerifier} from "../interfaces/IVerifier.sol";
import {IPool} from "../interfaces/aaveV3/IPool.sol";
import {Utils} from "../libraries/Utils.sol";
import {Config} from "../libraries/Config.sol";

/**
 * @title Term Structure Address Facet Contract
 */
contract AddressFacet is IAddressFacet, AccessControlInternal {
    using AddressLib for AddressStorage.Layout;

    /**
     * @inheritdoc IAddressFacet
     */
    function setVerifier(IVerifier newVerifier) external onlyRole(Config.ADMIN_ROLE) {
        Utils.notZeroAddr(address(newVerifier));
        AddressStorage.layout().verifier = newVerifier;
        emit SetVerifier(newVerifier);
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function setEvacuVerifier(IVerifier newEvacuVerifier) external onlyRole(Config.ADMIN_ROLE) {
        Utils.notZeroAddr(address(newEvacuVerifier));
        AddressStorage.layout().evacuVerifier = newEvacuVerifier;
        emit SetEvacuVerifier(newEvacuVerifier);
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function getWETH() external view returns (IWETH) {
        return AddressLib.getAddressStorage().getWETH();
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function getPoseidonUnit2() external view returns (IPoseidonUnit2) {
        return AddressLib.getAddressStorage().getPoseidonUnit2();
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function getVerifier() external view returns (IVerifier) {
        return AddressLib.getAddressStorage().getVerifier();
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function getEvacuVerifier() external view returns (IVerifier) {
        return AddressLib.getAddressStorage().getEvacuVerifier();
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function getAaveV3Pool() external view returns (IPool) {
        return AddressLib.getAddressStorage().getAaveV3Pool();
    }
}
