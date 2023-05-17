// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {SafeCast} from "@solidstate/contracts/utils/SafeCast.sol";
import {RollupFacet} from "../rollup/RollupFacet.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {LoanLib} from "../loan/LoanLib.sol";
import {Operations} from "../libraries/Operations.sol";
import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {LoanStorage, Loan} from "../loan/LoanStorage.sol";
import {Checker} from "../libraries/Checker.sol";
import {Config} from "../libraries/Config.sol";

contract RollupMock is RollupFacet {
    function updateLoanMock(Operations.AuctionEnd memory auctionEnd) external {
        // Checker.noneZeroAddr(AccountLib.getAccountAddr(auctionEnd.accountId));
        // // tsbToken config
        AssetConfig memory assetConfig = TokenLib.getAssetConfig(auctionEnd.tsbTokenId);
        // Checker.noneZeroAddr(assetConfig.tokenAddr);
        // if (!assetConfig.isTsbToken) revert InvalidTsbTokenAddr(assetConfig.tokenAddr);

        // debt token config
        (address underlyingAsset, uint32 maturityTime) = ITsbToken(assetConfig.tokenAddr).tokenInfo();
        (uint16 debtTokenId, AssetConfig memory underlyingAssetConfig) = TokenLib.getAssetConfig(underlyingAsset);

        // collateral token config
        assetConfig = TokenLib.getAssetConfig(auctionEnd.collateralTokenId);
        Checker.noneZeroAddr(assetConfig.tokenAddr);

        // update loan info
        bytes12 loanId = LoanLib.getLoanId(
            auctionEnd.accountId,
            maturityTime,
            debtTokenId,
            auctionEnd.collateralTokenId
        );
        Loan memory loan = LoanLib.getLoan(loanId);
        loan.accountId = auctionEnd.accountId;
        loan.debtTokenId = debtTokenId;
        loan.collateralTokenId = auctionEnd.collateralTokenId;
        loan.maturityTime = maturityTime;

        // calculate increase amount
        uint8 decimals = underlyingAssetConfig.decimals;
        uint128 increaseDebtAmt = SafeCast.toUint128(
            (auctionEnd.debtAmt * 10 ** decimals) / 10 ** Config.SYSTEM_DECIMALS
        );
        decimals = assetConfig.decimals;
        uint128 increaseCollateralAmt = SafeCast.toUint128(
            (auctionEnd.collateralAmt * 10 ** decimals) / 10 ** Config.SYSTEM_DECIMALS
        );
        loan.debtAmt += increaseDebtAmt;
        loan.collateralAmt += increaseCollateralAmt;

        LoanStorage.layout().loans[loanId] = loan;

        emit UpdateLoan(
            loanId,
            loan.accountId,
            loan.maturityTime,
            loan.debtTokenId,
            loan.collateralTokenId,
            increaseDebtAmt,
            increaseCollateralAmt
        );
    }
}