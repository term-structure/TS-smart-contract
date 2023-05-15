// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccountStorage} from "./AccountStorage.sol";
import {Config} from "../libraries/Config.sol";

library AccountLib {
    /// @notice Error for get account which is not registered
    error AccountIsNotRegistered(address l1AccountAddr);

    /// @notice Internal function to get the valid account id
    /// @dev Valid account is the account that is registered on Layer2
    /// @param l1AccountAddr The address of the account on Layer1
    /// @return accountId The user account id in Layer2
    function getValidAccount(address l1AccountAddr) internal view returns (uint32) {
        uint32 accountId = getAccountId(l1AccountAddr);
        if (accountId == 0) revert AccountIsNotRegistered(l1AccountAddr);
        return accountId;
    }

    /// @notice Return the accountAddr of accountId
    /// @param accountId user account id in layer2
    /// @return accountAddr user account address in layer1
    function getAccountAddr(uint32 accountId) internal view returns (address) {
        return AccountStorage.layout().accountAddresses[accountId];
    }

    /// @notice Return the accountId of accountAddr
    /// @param accountAddr user account address in layer1
    /// @return accountId user account id in layer2
    function getAccountId(address accountAddr) internal view returns (uint32) {
        return AccountStorage.layout().accountIds[accountAddr];
    }

    /// @notice Return the total number of accounts
    /// @return accountNum The total number of accounts
    function getAccountNum() internal view returns (uint32) {
        return AccountStorage.layout().accountNum;
    }
}
