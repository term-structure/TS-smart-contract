// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
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
    using LoanLib for Loan;
    using Utils for *;

    function updateLoanMock(Operations.AuctionEnd memory auctionEnd) external {
        // Utils.noneZeroAddr(AccountLib.getAccountAddr(auctionEnd.accountId));

        TokenStorage.Layout storage tsl = TokenLib.getTokenStorage();
        // tsbToken config
        AssetConfig memory assetConfig = tsl.getAssetConfig(auctionEnd.tsbTokenId);
        // Utils.noneZeroAddr(assetConfig.tokenAddr);
        // if (!assetConfig.isTsbToken) revert InvalidTsbTokenAddr(assetConfig.tokenAddr);

        // debt token config
        (IERC20 underlyingAsset, uint32 maturityTime) = ITsbToken(address(assetConfig.token)).tokenInfo();
        (uint16 debtTokenId, AssetConfig memory underlyingAssetConfig) = tsl.getAssetConfig(underlyingAsset);

        // collateral token config
        assetConfig = tsl.getAssetConfig(auctionEnd.collateralTokenId);
        Utils.noneZeroAddr(address(assetConfig.token));

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
        uint128 addedDebtAmt = SafeCast.toUint128(auctionEnd.debtAmt.toL1Amt(decimals));
        decimals = assetConfig.decimals;
        uint128 addedCollateralAmt = SafeCast.toUint128(auctionEnd.collateralAmt.toL1Amt(decimals));
        loan = loan.updateLoan(addedCollateralAmt, addedDebtAmt);

        LoanStorage.layout().loans[loanId] = loan;

        emit UpdateLoan(
            loanId,
            loan.accountId,
            loan.maturityTime,
            assetConfig.token,
            underlyingAssetConfig.token,
            addedCollateralAmt,
            addedDebtAmt
        );
    }
}
