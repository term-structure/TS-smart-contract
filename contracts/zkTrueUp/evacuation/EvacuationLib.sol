// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {EvacuationStorage} from "./EvacuationStorage.sol";

/**
 * @title Term Structure Evacuation Library
 * @author Term Structure Labs
 */
library EvacuationLib {
    using EvacuationLib for EvacuationStorage.Layout;

    /// @notice Error for trying to do transactions when evacuation mode is activated
    error EvacuModeActivated();
    /// @notice Error for the system is not in evacuation mode
    error NotEvacuMode();

    /// @notice Internal function to check if the contract is not in the evacuMode
    /// @param s The evacuation storage
    function requireActive(EvacuationStorage.Layout storage s) internal view {
        if (s.isEvacuMode()) revert EvacuModeActivated();
    }

    /// @notice Internal function to check if the contract is in the evacuMode
    /// @param s The evacuation storage
    function requireEvacuMode(EvacuationStorage.Layout storage s) internal view {
        if (!s.isEvacuMode()) revert NotEvacuMode();
    }

    /// @notice Internal function to get evacuation mode status
    /// @param s The evacuation storage
    /// @return evacuMode The evacuation mode status
    function isEvacuMode(EvacuationStorage.Layout storage s) internal view returns (bool) {
        return s.evacuMode;
    }

    /// @notice Internal function to get whether the specified accountId and tokenId is evacuated
    /// @param s The evacuation storage
    /// @param accountId The account id
    /// @param tokenId The token id
    /// @return isEvacuated Whether the specified accountId and tokenId is evacuated
    function isEvacuated(
        EvacuationStorage.Layout storage s,
        uint32 accountId,
        uint16 tokenId
    ) internal view returns (bool) {
        return s.evacuated[accountId][tokenId];
    }
}
