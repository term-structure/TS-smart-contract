// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@solidstate/contracts/utils/SafeCast.sol";
import {AccountStorage} from "../zkTrueUp/account/AccountStorage.sol";
import {LoanStorage, Loan} from "../zkTrueUp/loan/LoanStorage.sol";
import {TokenStorage} from "../zkTrueUp/token/TokenStorage.sol";
import {RollupFacet} from "../zkTrueUp/rollup/RollupFacet.sol";
import {AccountLib} from "../zkTrueUp/account/AccountLib.sol";
import {TokenLib} from "../zkTrueUp/token/TokenLib.sol";
import {LoanLib} from "../zkTrueUp/loan/LoanLib.sol";
import {Operations} from "../zkTrueUp/libraries/Operations.sol";
import {ITsbToken} from "../zkTrueUp/interfaces/ITsbToken.sol";
import {AssetConfig} from "../zkTrueUp/token/TokenStorage.sol";
import {Utils} from "../zkTrueUp/libraries/Utils.sol";
import {Config} from "../zkTrueUp/libraries/Config.sol";

contract RollupMock is RollupFacet {
    using AccountLib for AccountStorage.Layout;
    using LoanLib for LoanStorage.Layout;
    using TokenLib for TokenStorage.Layout;
    using LoanLib for Loan;
    using Utils for *;

    function updateLoanMock(Operations.AuctionEnd memory auctionEnd) external {
        uint32 accountId = auctionEnd.accountId;
        address accountAddr = AccountStorage.layout().getAccountAddr(accountId);
        // Utils.noneZeroAddr(accountAddr); //! ignore for test

        TokenStorage.Layout storage tsl = TokenStorage.layout();
        // tsbToken config
        AssetConfig memory assetConfig = tsl.getAssetConfig(auctionEnd.tsbTokenId);
        address tokenAddr = address(assetConfig.token);
        // Utils.noneZeroAddr(tokenAddr); //! ignore for test
        ITsbToken tsbToken = ITsbToken(tokenAddr);
        // if (!assetConfig.isTsbToken) revert InvalidTsbTokenAddr(tokenAddr); //! ignore for test

        (bytes12 loanId, uint128 collateralAmt, uint128 debtAmt) = _getAuctionInfo(tsl, auctionEnd, tsbToken);

        // update loan
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        Loan memory loan = lsl.getLoan(loanId);
        loan = loan.updateLoan(collateralAmt, debtAmt);
        lsl.loans[loanId] = loan;

        emit UpdateLoan(loanId, accountId, collateralAmt, debtAmt);
    }

    function _getAuctionInfo(
        TokenStorage.Layout storage tsl,
        Operations.AuctionEnd memory auctionEnd,
        ITsbToken tsbToken
    ) internal view override returns (bytes12, uint128, uint128) {
        uint128 debtAmt;
        bytes12 loanId;
        {
            // debt token config
            (IERC20 underlyingToken, uint32 maturityTime) = tsbToken.tokenInfo();
            (uint16 debtTokenId, AssetConfig memory underlyingAsset) = tsl.getAssetConfig(underlyingToken);
            loanId = LoanLib.calcLoanId(auctionEnd.accountId, maturityTime, debtTokenId, auctionEnd.collateralTokenId);
            debtAmt = SafeCast.toUint128(auctionEnd.debtAmt.toL1Amt(underlyingAsset.decimals));
        }

        // collateral token config
        AssetConfig memory assetConfig = tsl.getAssetConfig(auctionEnd.collateralTokenId);
        // Utils.notZeroAddr(address(assetConfig.token)); //! ignore for test
        uint128 collateralAmt = SafeCast.toUint128(auctionEnd.collateralAmt.toL1Amt(assetConfig.decimals));

        return (loanId, collateralAmt, debtAmt);
    }
}
