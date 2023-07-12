// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {FlashLoanStorage} from "./FlashLoanStorage.sol";

/**
 * @title Term Structure Flash Loan Library
 */
library FlashLoanLib {
    /// @notice Internal function to return the flash loan premium
    /// @return flashLoanPremium The flash loan premium
    function getFlashLoanPremium(FlashLoanStorage.Layout storage s) internal view returns (uint16) {
        return s.flashLoanPremium;
    }
}
