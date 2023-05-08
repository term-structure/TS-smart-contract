// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {SolidStateDiamond} from "@solidstate/contracts/proxy/diamond/SolidStateDiamond.sol";
import {AccessControl} from "@solidstate/contracts/access/access_control/AccessControl.sol";

contract ZkTrueUp is SolidStateDiamond, AccessControl {}
