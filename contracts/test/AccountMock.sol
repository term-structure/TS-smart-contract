// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccountStorage} from "../zkTrueUp/account/AccountStorage.sol";
import {TokenStorage} from "../zkTrueUp/token/TokenStorage.sol";
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

    event Withdraw(address indexed accountAddr, uint32 accountId, IERC20 token, uint16 tokenId, uint256 amount);

    function withdraw(IERC20 token, uint256 amount, uint32 accountId) external override nonReentrant {
        AccountStorage.Layout storage asl = AccountStorage.layout();
        address accountAddr = asl.getAccountAddr(accountId);
        if (accountAddr != msg.sender) revert AccountAddrIsNotSender(accountAddr, msg.sender);

        (uint16 tokenId, AssetConfig memory assetConfig) = TokenStorage.layout().getValidToken(token);
        // RollupLib.removePendingBalance(msg.sender, tokenId, amount); //! ignore for test
        emit Withdraw(msg.sender, accountId, assetConfig.token, tokenId, amount);
        assetConfig.isTsbToken
            ? TsbLib.mintTsbToken(ITsbToken(address(token)), msg.sender, amount)
            : Utils.transfer(token, payable(msg.sender), amount);
    }
}
