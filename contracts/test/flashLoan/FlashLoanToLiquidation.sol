// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFlashLoanFacet} from "../../flashLoan/IFlashLoanFacet.sol";
import {ILoanFacet, Loan} from "../../loan/ILoanFacet.sol";
import {ITokenFacet} from "../../token/ITokenFacet.sol";
import {IFlashLoanReceiver} from "../../interfaces/IFlashLoanReceiver.sol";

/// @title FlashLoanToLiquidation
/// @notice Flash Loan to liquidate a loan
contract FlashLoanToLiquidation is IFlashLoanReceiver {
    uint256 internal constant MAX_UINT_256 = 2 ** 256 - 1;
    bytes12 internal _loanId;
    address internal _liquidator;
    address internal _zkTrueUpAddr;
    IFlashLoanFacet internal flashLoanFacet;
    ILoanFacet internal loanFacet;
    ITokenFacet internal tokenFacet;

    constructor(address payable zkTrueUpAddr, bytes12 loanId) {
        _zkTrueUpAddr = zkTrueUpAddr;
        flashLoanFacet = IFlashLoanFacet(zkTrueUpAddr);
        loanFacet = ILoanFacet(zkTrueUpAddr);
        tokenFacet = ITokenFacet(zkTrueUpAddr);
        _loanId = loanId;
        _liquidator = msg.sender;
    }

    function executeOperation(
        address sender,
        address[] calldata assets,
        uint128[] calldata amounts,
        uint128[] calldata premiums,
        bytes calldata data
    ) external override returns (bool) {
        Loan memory loan = loanFacet.getLoan(_loanId);
        address collateralToken = tokenFacet.getAssetConfig(loan.collateralTokenId).tokenAddr;
        (, uint128 liquidatorRewardAmt, ) = loanFacet.liquidate(_loanId);
        if (collateralToken == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            (bool success, ) = _liquidator.call{value: liquidatorRewardAmt}("");
            return success;
        } else {
            IERC20(collateralToken).transfer(_liquidator, liquidatorRewardAmt);
            return true;
        }
    }

    function flashLoanCall(address[] calldata assets, uint128[] calldata amounts) external {
        for (uint256 i = 0; i < assets.length; i++) {
            IERC20(assets[i]).approve(_zkTrueUpAddr, MAX_UINT_256);
        }
        bytes memory data = "";
        flashLoanFacet.flashLoan(payable(address(this)), assets, amounts, data);
    }

    receive() external payable {}
}