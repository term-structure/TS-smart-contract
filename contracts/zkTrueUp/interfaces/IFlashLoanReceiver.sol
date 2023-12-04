// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Term Structure FlashLoan Receiver interface
 * @author Term Structure Labs
 * @notice Interface for flash loan receiver contract to execute operation
 */
interface IFlashLoanReceiver {
    /// @notice Execute operation to be called in flash loan function
    /// @dev Add your operations logic here
    /// @param sender Address of the sender
    /// @param assets Array of assets to be flash loaned
    /// @param amounts Array of amounts to be flash loaned
    /// @param premiums Array of premiums to be paid
    /// @param data Data to be passed to the receiver
    function executeOperation(
        address sender,
        IERC20[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        bytes calldata data
    ) external;
}
