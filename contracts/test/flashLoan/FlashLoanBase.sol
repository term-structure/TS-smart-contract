// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFlashLoanFacet} from "../../zkTrueUp/flashLoan/IFlashLoanFacet.sol";
import {ILoanFacet} from "../../zkTrueUp/loan/ILoanFacet.sol";
import {IFlashLoanReceiver} from "../../zkTrueUp/interfaces/IFlashLoanReceiver.sol";

/// @title FlashLoanBase
/// @notice Flash Loan base contract
contract FlashLoanBase is IFlashLoanReceiver {
    uint256 internal constant MAX_UINT_256 = 2 ** 256 - 1;
    address internal _zkTrueUpAddr;
    IFlashLoanFacet internal flashLoanFacet;
    ILoanFacet internal loanFacet;

    constructor(address payable zkTrueUpAddr) {
        _zkTrueUpAddr = zkTrueUpAddr;
        flashLoanFacet = IFlashLoanFacet(zkTrueUpAddr);
        loanFacet = ILoanFacet(zkTrueUpAddr);
    }

    /**
     * @inheritdoc IFlashLoanReceiver
     */
    function executeOperation(
        address sender,
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        bytes calldata data
    ) external {
        // do something...
    }

    function flashLoanCall(address[] calldata assets, uint256[] calldata amounts) external {
        for (uint256 i = 0; i < assets.length; i++) {
            IERC20(assets[i]).approve(_zkTrueUpAddr, MAX_UINT_256);
        }
        bytes memory data = "";
        flashLoanFacet.flashLoan(payable(address(this)), assets, amounts, data);
    }
}
