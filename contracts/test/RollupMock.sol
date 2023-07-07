// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {SafeCast} from "@solidstate/contracts/utils/SafeCast.sol";
import {LoanStorage, Loan} from "../zkTrueUp/loan/LoanStorage.sol";
import {TokenStorage} from "../zkTrueUp/token/TokenStorage.sol";
import {RollupFacet} from "../zkTrueUp/rollup/RollupFacet.sol";
import {TokenLib} from "../zkTrueUp/token/TokenLib.sol";
import {LoanLib} from "../zkTrueUp/loan/LoanLib.sol";
import {Operations} from "../zkTrueUp/libraries/Operations.sol";
import {ITsbToken} from "../zkTrueUp/interfaces/ITsbToken.sol";
import {AssetConfig} from "../zkTrueUp/token/TokenStorage.sol";
import {Utils} from "../zkTrueUp/libraries/Utils.sol";
import {Config} from "../zkTrueUp/libraries/Config.sol";

contract RollupMock is RollupFacet {
    using LoanLib for LoanStorage.Layout;
    using TokenLib for TokenStorage.Layout;

    function updateLoanMock(Operations.AuctionEnd memory auctionEnd) external {
        // Utils.noneZeroAddr(AccountLib.getAccountAddr(auctionEnd.accountId));

        TokenStorage.Layout storage tsl = TokenLib.getTokenStorage();
        // tsbToken config
        AssetConfig memory assetConfig = tsl.getAssetConfig(auctionEnd.tsbTokenId);
        // Utils.noneZeroAddr(assetConfig.tokenAddr);
        // if (!assetConfig.isTsbToken) revert InvalidTsbTokenAddr(assetConfig.tokenAddr);

        // debt token config
        (address underlyingAsset, uint32 maturityTime) = ITsbToken(assetConfig.tokenAddr).tokenInfo();
        (uint16 debtTokenId, AssetConfig memory underlyingAssetConfig) = tsl.getAssetConfig(underlyingAsset);

        // collateral token config
        assetConfig = tsl.getAssetConfig(auctionEnd.collateralTokenId);
        Utils.noneZeroAddr(assetConfig.tokenAddr);

        // update loan info
        bytes12 loanId = LoanLib.getLoanId(
            auctionEnd.accountId,
            maturityTime,
            debtTokenId,
            auctionEnd.collateralTokenId
        );
        Loan memory loan = LoanLib.getLoanStorage().getLoan(loanId);
        loan.accountId = auctionEnd.accountId;
        loan.debtTokenId = debtTokenId;
        loan.collateralTokenId = auctionEnd.collateralTokenId;
        loan.maturityTime = maturityTime;

        // calculate added amount
        uint8 decimals = underlyingAssetConfig.decimals;
        uint128 addedDebtAmt = Utils.toL1Amt(auctionEnd.debtAmt, decimals);
        decimals = assetConfig.decimals;
        uint128 addedCollateralAmt = Utils.toL1Amt(auctionEnd.collateralAmt, decimals);
        loan.debtAmt += addedDebtAmt;
        loan.collateralAmt += addedCollateralAmt;

        LoanStorage.layout().loans[loanId] = loan;

        emit UpdateLoan(
            loanId,
            loan.accountId,
            loan.maturityTime,
            assetConfig.tokenAddr,
            underlyingAssetConfig.tokenAddr,
            addedCollateralAmt,
            addedDebtAmt
        );
    }
}
