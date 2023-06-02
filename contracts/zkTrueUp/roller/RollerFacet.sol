// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ISolidStateERC20} from "@solidstate/contracts/token/ERC20/ISolidStateERC20.sol";
import {SafeERC20} from "@solidstate/contracts/utils/SafeERC20.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {LoanLib} from "../loan/LoanLib.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {IPool} from "../interfaces/IAaveV3Pool.sol";
import {LoanStorage, Loan} from "../loan/LoanStorage.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {LiquidationFactor} from "../loan/LoanStorage.sol";
import {Config} from "../libraries/Config.sol";

import {console} from "hardhat/console.sol";

contract RollerFacet {
    using SafeERC20 for ISolidStateERC20;

    function rollToAave(bytes12 loanId, uint128 collateralAmt, uint128 debtAmt) external {
        Loan memory loan = LoanLib.getLoan(loanId);
        LoanLib.senderIsLoanOwner(msg.sender, AccountLib.getAccountAddr(loan.accountId));
        (
            LiquidationFactor memory liquidationFactor,
            AssetConfig memory collateralAsset,
            AssetConfig memory debtAsset
        ) = LoanLib.getLoanInfo(loan);
        loan.debtAmt -= debtAmt;
        loan.collateralAmt -= collateralAmt;
        (uint256 healthFactor, , ) = LoanLib.getHealthFactor(
            loan,
            liquidationFactor.ltvThreshold,
            collateralAsset,
            debtAsset
        );
        LoanLib.requireHealthy(healthFactor);

        address aaveV3PoolAddr = AddressLib.getAaveV3PoolAddr();
        IPool aaveV3Pool = IPool(aaveV3PoolAddr);
        address supplyTokenAddr;
        // using ISolidStateERC20 instead of customized transferFrom because of the AAVE receive WETH instead of ETH
        if (collateralAsset.tokenAddr == Config.ETH_ADDRESS) {
            address wethAddr = AddressLib.getWETHAddr();
            IWETH(wethAddr).approve(aaveV3PoolAddr, collateralAmt);
            supplyTokenAddr = wethAddr;
        } else {
            ISolidStateERC20(collateralAsset.tokenAddr).approve(aaveV3PoolAddr, collateralAmt);
            supplyTokenAddr = collateralAsset.tokenAddr;
        }

        try aaveV3Pool.supply(supplyTokenAddr, collateralAmt, address(this), 0) {
            try aaveV3Pool.borrow(debtAsset.tokenAddr, debtAmt, 2, 0, address(this)) {
                LoanStorage.layout().loans[loanId] = loan;
            } catch {
                revert("RollerFacet: borrow from Aave failed");
            }
        } catch {
            revert("AaveV3Pool: supply failed");
        }
    }
}
