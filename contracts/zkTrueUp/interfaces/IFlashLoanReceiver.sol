// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

import {ILoanFacet} from "../loan/ILoanFacet.sol";

/**
 * @title Term Structure FlashLoan Receiver interface
 */
interface IFlashLoanReceiver {
    /// @notice Execute operation to be called in flash loan function
    /// @dev Add your operations logic here
    /// @param sender Address of the sender
    /// @param assets Array of assets to be flash loaned
    /// @param amounts Array of amounts to be flash loaned
    /// @param premiums Array of premiums to be paid
    /// @param data Data to be passed to the receiver
    /// @return Boolean indicating if the operation was successful
    function executeOperation(
        address sender,
        address[] calldata assets,
        uint128[] calldata amounts,
        uint128[] calldata premiums,
        bytes calldata data
    ) external returns (bool);
}
