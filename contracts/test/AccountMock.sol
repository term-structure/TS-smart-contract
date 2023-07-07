// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccountStorage} from "../zkTrueUp/account/AccountStorage.sol";
import {TokenStorage} from "../zkTrueUp/token/TokenStorage.sol";
import {AccountFacet} from "../zkTrueUp/account/AccountFacet.sol";
import {AccountLib} from "../zkTrueUp/account/AccountLib.sol";
import {TokenLib} from "../zkTrueUp/token/TokenLib.sol";
import {RollupLib} from "../zkTrueUp/rollup/RollupLib.sol";
import {TsbLib} from "../zkTrueUp/tsb/TsbLib.sol";
import {AssetConfig} from "../zkTrueUp/token/TokenStorage.sol";
import {Utils} from "../zkTrueUp/libraries/Utils.sol";

//! Mock contract for testing
contract AccountMock is AccountFacet {
    using AccountLib for AccountStorage.Layout;
    using TokenLib for TokenStorage.Layout;

    event Withdraw(address indexed accountAddr, uint32 accountId, address tokenAddr, uint16 tokenId, uint128 amount);

    function withdraw(address tokenAddr, uint128 amount) external override nonReentrant {
        uint32 accountId = AccountLib.getAccountStorage().getValidAccount(msg.sender);
        (uint16 tokenId, AssetConfig memory assetConfig) = TokenLib.getTokenStorage().getValidToken(tokenAddr);
        // RollupLib.updateWithdrawalRecord(msg.sender, tokenId, amount); //! ignore for test
        emit Withdraw(msg.sender, accountId, assetConfig.tokenAddr, tokenId, amount);
        assetConfig.isTsbToken
            ? TsbLib.mintTsbToken(tokenAddr, msg.sender, amount)
            : Utils.transfer(tokenAddr, payable(msg.sender), amount);
    }
}
