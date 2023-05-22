// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {SolidStateDiamond} from "@solidstate/contracts/proxy/diamond/SolidStateDiamond.sol";
import {AccessControl} from "@solidstate/contracts/access/access_control/AccessControl.sol";

/**
 * @title Zk-TrueUp Contract
 * @author Term Structure Labs
 * @notice The core contract of Term Structure Protocol, which implemented by
 *         diamond proxy standard.
 */
contract ZkTrueUp is SolidStateDiamond, AccessControl {

}
