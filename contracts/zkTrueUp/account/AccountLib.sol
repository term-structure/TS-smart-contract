// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IPoseidonUnit2} from "../interfaces/IPoseidonUnit2.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {AccountStorage} from "./AccountStorage.sol";
import {Operations} from "../libraries/Operations.sol";
import {Utils} from "../libraries/Utils.sol";

/**
 * @title Term Structure Account Library
 */
library AccountLib {
    /// @notice Error for get account which is not registered
    error AccountIsNotRegistered(address accountAddr);

    /// @notice Emit when there is a new account registered
    /// @param accountAddr The user account address in layer1
    /// @param accountId The user account id in the L2 system
    /// @param tsPubX The x coordinate of the public key of the account
    /// @param tsPubY The y coordinate of the public key of the account
    /// @param tsAddr The address of the account in the L2 system
    event Register(address indexed accountAddr, uint32 accountId, uint256 tsPubX, uint256 tsPubY, bytes20 tsAddr);

    /// @notice Emit when there is a new deposit
    /// @param accountAddr The user account address in layer1
    /// @param accountId The user account id in the L2 system
    /// @param tokenAddr The address of the deposit token
    /// @param tokenId The token id of the deposit token
    /// @param amount The deposit amount
    event Deposit(address indexed accountAddr, uint32 accountId, address tokenAddr, uint16 tokenId, uint128 amount);

    /// @notice Emit when there is a new force withdraw
    /// @param accountAddr The user account address in layer1
    /// @param tokenAddr The address of the force withdraw token
    /// @param accountId The user account id in the L2 system
    /// @param tokenId Layer2 id of force withdraw token
    event ForceWithdraw(address indexed accountAddr, uint32 accountId, address tokenAddr, uint16 tokenId);

    /// @notice Emit when there is a new withdraw
    /// @param accountAddr The user account address in layer1
    /// @param accountId The user account id in the L2 system
    /// @param tokenAddr The address of the withdraw token
    /// @param tokenId Layer2 id of withdraw token
    /// @param amount The withdraw amount
    event Withdraw(address indexed accountAddr, uint32 accountId, address tokenAddr, uint16 tokenId, uint128 amount);

    /// @notice Internal function to add register request
    /// @param sender The address of the account on Layer1
    /// @param accountId The user account id in Layer2
    /// @param tsPubKeyX The x coordinate of the public key of the account
    /// @param tsPubKeyY The y coordinate of the public key of the account
    function addRegisterReq(address sender, uint32 accountId, uint256 tsPubKeyX, uint256 tsPubKeyY) internal {
        bytes20 tsAddr = bytes20(
            uint160(IPoseidonUnit2(AddressLib.getPoseidonUnit2Addr()).poseidon([tsPubKeyX, tsPubKeyY]))
        );
        Operations.Register memory op = Operations.Register({accountId: accountId, tsAddr: tsAddr});
        bytes memory pubData = Operations.encodeRegisterPubData(op);
        RollupLib.addL1Request(sender, Operations.OpType.REGISTER, pubData);
        emit Register(sender, accountId, tsPubKeyX, tsPubKeyY, tsAddr);
    }

    /// @notice Internal function to add deposit request
    /// @param to The address of the account on Layer1
    /// @param accountId The user account id in Layer2
    /// @param tokenAddr The address of the deposit token
    /// @param tokenId The token id of the deposit token
    /// @param decimals The decimals of the deposit token
    /// @param amount The deposit amount
    function addDepositReq(
        address to,
        uint32 accountId,
        address tokenAddr,
        uint16 tokenId,
        uint8 decimals,
        uint128 amount
    ) internal {
        uint128 l2Amt = Utils.toL2Amt(amount, decimals);
        Operations.Deposit memory op = Operations.Deposit({accountId: accountId, tokenId: tokenId, amount: l2Amt});
        bytes memory pubData = Operations.encodeDepositPubData(op);
        RollupLib.addL1Request(to, Operations.OpType.DEPOSIT, pubData);
        emit Deposit(to, accountId, tokenAddr, tokenId, amount);
    }

    /// @notice Internal function to add force withdraw request
    /// @param sender The address of the account on Layer1
    /// @param accountId The user account id in Layer2
    /// @param tokenAddr The address of the force withdraw token
    /// @param tokenId The token id of the force withdraw token
    function addForceWithdrawReq(address sender, uint32 accountId, address tokenAddr, uint16 tokenId) internal {
        Operations.ForceWithdraw memory op = Operations.ForceWithdraw({
            accountId: accountId,
            tokenId: tokenId,
            // user will not specify the amount
            // since forceWithdraw will refund all the available balance of the account
            amount: uint128(0)
        });
        bytes memory pubData = Operations.encodeForceWithdrawPubData(op);
        RollupLib.addL1Request(sender, Operations.OpType.FORCE_WITHDRAW, pubData);
        emit ForceWithdraw(sender, accountId, tokenAddr, tokenId);
    }

    /// @notice Internal function to update withdraw record
    /// @param sender The address of the account on Layer1
    /// @param accountId The user account id in Layer2
    /// @param tokenAddr The address of the withdraw token
    /// @param tokenId The token id of the withdraw token
    /// @param amount The withdraw amount
    function updateWithdrawRecord(
        address sender,
        uint32 accountId,
        address tokenAddr,
        uint16 tokenId,
        uint128 amount
    ) internal {
        RollupLib.updateWithdrawalRecord(sender, tokenId, amount);
        emit Withdraw(sender, accountId, tokenAddr, tokenId, amount);
    }

    /// @notice Internal function to get the valid account id
    /// @dev Valid account is the account that is registered on Layer2
    /// @param l1AccountAddr The address of the account on Layer1
    /// @return accountId The user account id in Layer2
    function getValidAccount(address l1AccountAddr) internal view returns (uint32) {
        uint32 accountId = getAccountId(l1AccountAddr);
        if (accountId == 0) revert AccountIsNotRegistered(l1AccountAddr);
        return accountId;
    }

    /// @notice Internal function to get the address by account id
    /// @param accountId user account id in layer2
    /// @return accountAddr user account address in layer1
    function getAccountAddr(uint32 accountId) internal view returns (address) {
        return AccountStorage.layout().accountAddresses[accountId];
    }

    /// @notice Internal function to get the account id by address
    /// @param accountAddr user account address in layer1
    /// @return accountId user account id in layer2
    function getAccountId(address accountAddr) internal view returns (uint32) {
        return AccountStorage.layout().accountIds[accountAddr];
    }

    /// @notice Internal function to get the total number of accounts
    /// @return accountNum The total number of accounts
    function getAccountNum() internal view returns (uint32) {
        return AccountStorage.layout().accountNum;
    }
}
