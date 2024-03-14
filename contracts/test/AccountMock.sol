// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccountStorage} from "../zkTrueUp/account/AccountStorage.sol";
import {TokenStorage} from "../zkTrueUp/token/TokenStorage.sol";
import {RollupStorage} from "../zkTrueUp/rollup/RollupStorage.sol";
import {AccountFacet} from "../zkTrueUp/account/AccountFacet.sol";
import {AccountLib} from "../zkTrueUp/account/AccountLib.sol";
import {TokenLib} from "../zkTrueUp/token/TokenLib.sol";
import {RollupLib} from "../zkTrueUp/rollup/RollupLib.sol";
import {TsbLib} from "../zkTrueUp/tsb/TsbLib.sol";
import {AssetConfig} from "../zkTrueUp/token/TokenStorage.sol";
import {ITsbToken} from "../zkTrueUp/interfaces/ITsbToken.sol";
import {Utils} from "../zkTrueUp/libraries/Utils.sol";

//! Mock contract for testing
contract AccountMock is AccountFacet {
    using AccountLib for AccountStorage.Layout;
    using TokenLib for TokenStorage.Layout;
    using RollupLib for RollupStorage.Layout;

    event Withdrawal(
        address indexed caller,
        address indexed accountAddr,
        uint32 accountId,
        IERC20 token,
        uint16 tokenId,
        uint256 amount
    );

    function _withdraw(
        address caller,
        address accountAddr,
        uint32 accountId,
        IERC20 token,
        uint256 amount
    ) internal override {
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        (uint16 tokenId, AssetConfig memory assetConfig) = tsl.getValidToken(token);

        // RollupStorage.Layout storage rsl = RollupStorage.layout();
        // AccountLib.updateWithdrawalRecord(rsl, caller, accountAddr, accountId, token, tokenId, amount);  //! ignore for testing
        emit Withdrawal(caller, accountAddr, accountId, token, tokenId, amount);

        Utils.tokenTransfer(token, payable(accountAddr), amount, assetConfig.isTsbToken);
    }
}
