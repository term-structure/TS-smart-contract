// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccountStorage} from "./AccountStorage.sol";
import {Config} from "../libraries/Config.sol";

abstract contract AccountInternal {
    /// @notice Error for trying to do transactions when evacuation mode is activated
    error EvacuModeActivated();

    /// @notice Internal function to check if the contract is not in the evacuMode
    function _requireActive() internal view {
        if (_isEvacuMode()) revert EvacuModeActivated();
    }

    /// @notice Return the evacuation mode is activated or not
    /// @return evacuMode The evacuation mode status
    function _isEvacuMode() internal view returns (bool) {
        return AccountStorage.layout().evacuMode;
    }

    /// @notice Return the total number of accounts
    /// @return accountNum The total number of accounts
    function _getAccountNum() internal view returns (uint32) {
        return AccountStorage.layout().accountNum;
    }
}
