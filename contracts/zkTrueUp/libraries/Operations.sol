// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ITsbToken} from "../interfaces/ITsbToken.sol";
import {Config} from "./Config.sol";
import {Bytes} from "./Bytes.sol";

/**
 * @title Operations Library
 * @author Term Structure Labs
 * @notice Library for define the operation type and the operation data structure,
 *         used in the rollup circuit
 */
library Operations {
    /// @notice circuit operation type
    enum OpType {
        NOOP,
        REGISTER,
        DEPOSIT,
        FORCE_WITHDRAW,
        TRANSFER,
        WITHDRAW,
        AUCTION_LEND,
        AUCTION_BORROW,
        AUCTION_START,
        AUCTION_MATCH,
        AUCTION_END,
        SECOND_LIMIT_ORDER,
        SECOND_LIMIT_START,
        SECOND_LIMIT_EXCHANGE,
        SECOND_LIMIT_END,
        SECOND_MARKET_ORDER,
        SECOND_MARKET_EXCHANGE,
        SECOND_MARKET_END,
        ADMIN_CANCEL_ORDER,
        USER_CANCEL_ORDER,
        INCREASE_EPOCH,
        CREATE_TSB_TOKEN,
        REDEEM,
        WITHDRAW_FEE,
        EVACUATION,
        SET_ADMIN_TS_ADDR,
        ROLL_OVER
    }

    /// @notice Public data struct definition
    struct Register {
        uint32 accountId;
        bytes20 tsAddr;
    }

    struct Deposit {
        uint32 accountId;
        uint16 tokenId;
        uint128 amount;
    }

    struct Withdraw {
        uint32 accountId;
        uint16 tokenId;
        uint128 amount;
        uint16 feeTokenId;
        uint128 feeAmt;
    }

    struct ForceWithdraw {
        uint32 accountId;
        uint16 tokenId;
        uint128 amount;
    }

    struct AuctionEnd {
        uint32 accountId;
        uint16 tsbTokenId;
        uint16 collateralTokenId;
        uint128 collateralAmt;
        uint128 debtAmt;
    }

    struct CreateTsbToken {
        uint32 maturityTime;
        uint16 baseTokenId;
        uint16 tsbTokenId;
    }

    struct WithdrawFee {
        uint16 tokenId;
        uint128 amount;
    }

    struct Evacuation {
        uint32 accountId;
        uint16 tokenId;
        uint128 amount;
    }

    struct RollOver {
        uint32 accountId;
        bytes12 loanId;
        address tsbTokenAddr;
        uint32 expiredTime;
        uint128 collateralAmt;
        uint128 maxAllowableDebtAmt;
    }

    /* ============ Encode public data function ============ */

    function encodeRegisterPubData(Register memory register) internal pure returns (bytes memory buf) {
        return abi.encodePacked(uint8(OpType.REGISTER), register.accountId, register.tsAddr);
    }

    function encodeDepositPubData(Deposit memory deposit) internal pure returns (bytes memory buf) {
        return abi.encodePacked(uint8(OpType.DEPOSIT), deposit.accountId, deposit.tokenId, deposit.amount);
    }

    function encodeForceWithdrawPubData(ForceWithdraw memory forceWithdraw) internal pure returns (bytes memory buf) {
        return
            abi.encodePacked(uint8(OpType.FORCE_WITHDRAW), forceWithdraw.accountId, forceWithdraw.tokenId, uint128(0));
    }

    function encodeEvacuationPubData(Evacuation memory evacuation) internal pure returns (bytes memory buf) {
        return abi.encodePacked(uint8(OpType.EVACUATION), evacuation.accountId, evacuation.tokenId, evacuation.amount);
    }

    function encodeRollOverPubData(RollOver memory rollOver) internal pure returns (bytes memory buf) {
        return
            abi.encodePacked(
                uint8(OpType.ROLL_OVER),
                rollOver.accountId,
                rollOver.loanId,
                rollOver.tsbTokenAddr,
                rollOver.expiredTime,
                rollOver.collateralAmt,
                rollOver.maxAllowableDebtAmt
            );
    }

    /* ============ Check hashed public data function ============ */

    function isRegisterHashedPubDataMatched(
        Register memory op,
        bytes32 hashedPubData
    ) internal pure returns (bool isExisted) {
        return keccak256(encodeRegisterPubData(op)) == hashedPubData;
    }

    function isDepositHashedPubDataMatched(
        Deposit memory op,
        bytes32 hashedPubData
    ) internal pure returns (bool isExisted) {
        return keccak256(encodeDepositPubData(op)) == hashedPubData;
    }

    function isForceWithdrawHashedPubDataMatched(
        ForceWithdraw memory op,
        bytes32 hashedPubData
    ) internal pure returns (bool isExisted) {
        return keccak256(encodeForceWithdrawPubData(op)) == hashedPubData;
    }

    function isEvacuationHashedPubDataMatched(
        Evacuation memory op,
        bytes32 hashedPubData
    ) internal pure returns (bool isExisted) {
        return keccak256(encodeEvacuationPubData(op)) == hashedPubData;
    }

    function isRollOverHashedPubDataMatched(
        RollOver memory op,
        bytes32 hashedPubData
    ) internal pure returns (bool isExisted) {
        return keccak256(encodeRollOverPubData(op)) == hashedPubData;
    }

    /* ============ Read public data function ============ */

    function readRegisterPubData(bytes memory data) internal pure returns (Register memory register) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        (offset, register.accountId) = Bytes.readUInt32(data, offset);
        (, register.tsAddr) = Bytes.readBytes20(data, offset);
    }

    function readDepositPubData(bytes memory data) internal pure returns (Deposit memory deposit) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        (offset, deposit.accountId) = Bytes.readUInt32(data, offset);
        (offset, deposit.tokenId) = Bytes.readUInt16(data, offset);
        (, deposit.amount) = Bytes.readUInt128(data, offset);
    }

    function readWithdrawPubData(bytes memory data) internal pure returns (Withdraw memory withdraw) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        (offset, withdraw.accountId) = Bytes.readUInt32(data, offset);
        (offset, withdraw.tokenId) = Bytes.readUInt16(data, offset);
        (, withdraw.amount) = Bytes.readUInt128(data, offset);
    }

    function readForceWithdrawPubData(bytes memory data) internal pure returns (ForceWithdraw memory forceWithdraw) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        (offset, forceWithdraw.accountId) = Bytes.readUInt32(data, offset);
        (offset, forceWithdraw.tokenId) = Bytes.readUInt16(data, offset);
        (, forceWithdraw.amount) = Bytes.readUInt128(data, offset);
    }

    function readAuctionEndPubData(bytes memory data) internal pure returns (AuctionEnd memory auctionEnd) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        (offset, auctionEnd.accountId) = Bytes.readUInt32(data, offset);
        (offset, auctionEnd.collateralTokenId) = Bytes.readUInt16(data, offset);
        (offset, auctionEnd.collateralAmt) = Bytes.readUInt128(data, offset);
        (offset, auctionEnd.tsbTokenId) = Bytes.readUInt16(data, offset);
        (, auctionEnd.debtAmt) = Bytes.readUInt128(data, offset);
    }

    function readCreateTsbTokenPubData(bytes memory data) internal pure returns (CreateTsbToken memory createTsbToken) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        (offset, createTsbToken.maturityTime) = Bytes.readUInt32(data, offset);
        (offset, createTsbToken.baseTokenId) = Bytes.readUInt16(data, offset);
        (, createTsbToken.tsbTokenId) = Bytes.readUInt16(data, offset);
    }

    function readWithdrawFeePubdata(bytes memory data) internal pure returns (WithdrawFee memory withdrawFee) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        (offset, withdrawFee.tokenId) = Bytes.readUInt16(data, offset);
        (, withdrawFee.amount) = Bytes.readUInt128(data, offset);
    }

    function readEvacuationPubdata(bytes memory data) internal pure returns (Evacuation memory evacuation) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        (offset, evacuation.accountId) = Bytes.readUInt32(data, offset);
        (offset, evacuation.tokenId) = Bytes.readUInt16(data, offset);
        (, evacuation.amount) = Bytes.readUInt128(data, offset);
    }

    function readRollOverPubdata(bytes memory data) internal pure returns (RollOver memory rollOver) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        (offset, rollOver.accountId) = Bytes.readUInt32(data, offset);
        (offset, rollOver.loanId) = Bytes.readBytes12(data, offset);
        (offset, rollOver.tsbTokenAddr) = Bytes.readAddress(data, offset);
        (offset, rollOver.expiredTime) = Bytes.readUInt32(data, offset);
        (offset, rollOver.collateralAmt) = Bytes.readUInt128(data, offset);
        (, rollOver.maxAllowableDebtAmt) = Bytes.readUInt128(data, offset);
    }
}
