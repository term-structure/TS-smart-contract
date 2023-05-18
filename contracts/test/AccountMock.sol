// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccountFacet} from "../account/AccountFacet.sol";
import {AccountLib} from "../account/AccountLib.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {TsbLib} from "../tsb/TsbLib.sol";
import {AssetConfig} from "../token/TokenStorage.sol";
import {Utils} from "../libraries/Utils.sol";

//! Mock contract for testing
contract AccountMock is AccountFacet {
    event Withdraw(address indexed accountAddr, uint32 accountId, uint16 tokenId, uint128 amount);

    function withdraw(address tokenAddr, uint128 amount) external override nonReentrant {
        uint32 accountId = AccountLib.getValidAccount(msg.sender);
        (uint16 tokenId, AssetConfig memory assetConfig) = TokenLib.getValidToken(tokenAddr);
        // RollupLib.updateWithdrawalRecord(msg.sender, tokenId, amount); //! ignore for test
        emit Withdraw(msg.sender, accountId, tokenId, amount);
        assetConfig.isTsbToken
            ? TsbLib.mintTsbToken(tokenAddr, msg.sender, amount)
            : Utils.transfer(tokenAddr, payable(msg.sender), amount);
    }
}
