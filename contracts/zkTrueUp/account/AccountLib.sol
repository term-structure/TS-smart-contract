// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AddressLib} from "../address/AddressLib.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {AccountStorage} from "./AccountStorage.sol";
import {AddressStorage} from "../address/AddressStorage.sol";
import {RollupStorage} from "../rollup/RollupStorage.sol";
import {Operations} from "../libraries/Operations.sol";
import {Utils} from "../libraries/Utils.sol";

/**
 * @title Term Structure Account Library
 * @author Term Structure Labs
 */
library AccountLib {
    using AccountLib for AccountStorage.Layout;
    using AddressLib for AddressStorage.Layout;
    using RollupLib for RollupStorage.Layout;
    using Utils for *;

    /// @notice Error for get account which is not registered
    error AccountIsNotRegistered(address accountAddr);

    /// @notice Emit when there is a new account registered
    /// @param accountAddr The user account address in layer1
    /// @param accountId The user account id in the L2 system
    /// @param tsPubX The x coordinate of the public key of the account
    /// @param tsPubY The y coordinate of the public key of the account
    /// @param tsAddr The address of the account in the L2 system
    event Registration(
        address indexed accountAddr,
        uint32 indexed accountId,
        uint256 tsPubX,
        uint256 tsPubY,
        bytes20 tsAddr
    );

    /// @notice Emit when there is a new deposit
    /// @param accountAddr The user account address in layer1
    /// @param accountId The user account id in the L2 system
    /// @param token The deposited token
    /// @param tokenId The token id of the deposit token
    /// @param amount The deposit amount
    event Deposit(address indexed accountAddr, uint32 indexed accountId, IERC20 token, uint16 tokenId, uint128 amount);

    /// @notice Emit when there is a new force withdraw
    /// @param accountAddr The user account address in layer1
    /// @param accountId The user account id in the L2 system
    /// @param token The force withdraw token
    /// @param tokenId Layer2 id of force withdraw token
    event ForceWithdrawal(address indexed accountAddr, uint32 indexed accountId, IERC20 token, uint16 tokenId);

    /// @notice Emit when there is a new withdraw
    /// @param accountAddr The user account address in layer1
    /// @param accountId The user account id in the L2 system
    /// @param token The withdraw token
    /// @param tokenId Layer2 id of withdraw token
    /// @param amount The withdraw amount
    event Withdrawal(
        address indexed accountAddr,
        uint32 indexed accountId,
        IERC20 token,
        uint16 tokenId,
        uint256 amount
    );

    /// @notice Internal function to add register request
    /// @param rsl The rollup storage layout
    /// @param sender The address of the account on Layer1
    /// @param accountId The user account id in Layer2
    /// @param tsPubKeyX The x coordinate of the public key of the account
    /// @param tsPubKeyY The y coordinate of the public key of the account
    function addRegisterReq(
        RollupStorage.Layout storage rsl,
        address sender,
        uint32 accountId,
        uint256 tsPubKeyX,
        uint256 tsPubKeyY
    ) internal {
        AddressStorage.Layout storage asl = AddressStorage.layout();
        bytes20 tsAddr = bytes20(uint160(asl.getPoseidonUnit2().poseidon([tsPubKeyX, tsPubKeyY])));
        Operations.Register memory op = Operations.Register({accountId: accountId, tsAddr: tsAddr});
        bytes memory pubData = Operations.encodeRegisterPubData(op);
        rsl.addL1Request(sender, Operations.OpType.REGISTER, pubData);
        emit Registration(sender, accountId, tsPubKeyX, tsPubKeyY, tsAddr);
    }

    /// @notice Internal function to add deposit request
    /// @param rsl The rollup storage layout
    /// @param to The address of the account on Layer1
    /// @param accountId The user account id in Layer2
    /// @param token The token to be deposited
    /// @param tokenId The token id of the deposit token
    /// @param decimals The decimals of the deposit token
    /// @param amount The deposit amount
    function addDepositReq(
        RollupStorage.Layout storage rsl,
        address to,
        uint32 accountId,
        IERC20 token,
        uint16 tokenId,
        uint8 decimals,
        uint128 amount
    ) internal {
        uint128 l2Amt = amount.toL2Amt(decimals);
        Operations.Deposit memory op = Operations.Deposit({accountId: accountId, tokenId: tokenId, amount: l2Amt});
        bytes memory pubData = Operations.encodeDepositPubData(op);
        rsl.addL1Request(to, Operations.OpType.DEPOSIT, pubData);
        emit Deposit(to, accountId, token, tokenId, amount);
    }

    /// @notice Internal function to add force withdraw request
    /// @param rsl The rollup storage layout
    /// @param sender The address of the account on Layer1
    /// @param accountId The user account id in Layer2
    /// @param token The token to be withdrawn
    /// @param tokenId The token id of the force withdraw token
    function addForceWithdrawReq(
        RollupStorage.Layout storage rsl,
        address sender,
        uint32 accountId,
        IERC20 token,
        uint16 tokenId
    ) internal {
        Operations.ForceWithdraw memory op = Operations.ForceWithdraw({
            accountId: accountId,
            tokenId: tokenId,
            // user will not specify the amount
            // since forceWithdraw will refund all the available balance of the account
            amount: uint128(0)
        });
        bytes memory pubData = Operations.encodeForceWithdrawPubData(op);
        rsl.addL1Request(sender, Operations.OpType.FORCE_WITHDRAW, pubData);
        emit ForceWithdrawal(sender, accountId, token, tokenId);
    }

    /// @notice Internal function to update withdraw record
    /// @param rsl The rollup storage layout
    /// @param sender The address of the account on Layer1
    /// @param accountId The user account id in Layer2
    /// @param token The token to be withdrawn
    /// @param tokenId The token id of the withdraw token
    /// @param amount The withdraw amount
    function updateWithdrawalRecord(
        RollupStorage.Layout storage rsl,
        address sender,
        uint32 accountId,
        IERC20 token,
        uint16 tokenId,
        uint256 amount
    ) internal {
        rsl.removePendingBalance(sender, tokenId, amount);
        emit Withdrawal(sender, accountId, token, tokenId, amount);
    }

    /// @notice Internal function to get the valid account id
    /// @dev Valid account is the account that is registered on Layer2
    /// @param s The account storage layout
    /// @param l1AccountAddr The address of the account on Layer1
    /// @return accountId The user account id in Layer2
    function getValidAccount(AccountStorage.Layout storage s, address l1AccountAddr) internal view returns (uint32) {
        uint32 accountId = s.getAccountId(l1AccountAddr);
        if (accountId == 0) revert AccountIsNotRegistered(l1AccountAddr);
        return accountId;
    }

    /// @notice Internal function to get the address by account id
    /// @param s The account storage layout
    /// @param accountId user account id in layer2
    /// @return accountAddr user account address in layer1
    function getAccountAddr(AccountStorage.Layout storage s, uint32 accountId) internal view returns (address) {
        return s.accountAddresses[accountId];
    }

    /// @notice Internal function to get the account id by address
    /// @param s The account storage layout
    /// @param accountAddr user account address in layer1
    /// @return accountId user account id in layer2
    function getAccountId(AccountStorage.Layout storage s, address accountAddr) internal view returns (uint32) {
        return s.accountIds[accountAddr];
    }

    /// @notice Internal function to get the total number of accounts
    /// @param s The account storage layout
    /// @return accountNum The total number of accounts
    function getAccountNum(AccountStorage.Layout storage s) internal view returns (uint32) {
        return s.accountNum;
    }
}
