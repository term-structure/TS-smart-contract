// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {FlashLoanStorage} from "./FlashLoanStorage.sol";

library FlashLoanLib {
    /// @notice Return the flash loan premium
    /// @return flashLoanPremium The flash loan premium
    function getFlashLoanPremium() internal view returns (uint16) {
        return FlashLoanStorage.layout().flashLoanPremium;
    }
}
