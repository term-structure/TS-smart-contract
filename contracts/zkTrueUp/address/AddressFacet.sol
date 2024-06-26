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
 * @author Term Structure Labs
 * @notice The AddressFacet contract is used to store the addresses which interact with the Term Structure Protocol.
 */
contract AddressFacet is IAddressFacet, AccessControlInternal {
    using AddressLib for AddressStorage.Layout;

    /* ============ External Admin Functions ============ */

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

    /* ============ External View Functions ============ */

    /**
     * @inheritdoc IAddressFacet
     */
    function getWETH() external view returns (IWETH) {
        return AddressStorage.layout().getWETH();
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function getPoseidonUnit2() external view returns (IPoseidonUnit2) {
        return AddressStorage.layout().getPoseidonUnit2();
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function getVerifier() external view returns (IVerifier) {
        return AddressStorage.layout().getVerifier();
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function getEvacuVerifier() external view returns (IVerifier) {
        return AddressStorage.layout().getEvacuVerifier();
    }

    /**
     * @inheritdoc IAddressFacet
     */
    function getAaveV3Pool() external view returns (IPool) {
        return AddressStorage.layout().getAaveV3Pool();
    }
}
