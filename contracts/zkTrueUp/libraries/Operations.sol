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
        NOOP, // 0
        REGISTER, // 1
        DEPOSIT, // 2
        FORCE_WITHDRAW, // 3
        TRANSFER, // 4
        WITHDRAW, // 5
        AUCTION_LEND, // 6
        AUCTION_BORROW, // 7
        AUCTION_START, // 8
        AUCTION_MATCH, // 9
        AUCTION_END, // 10
        SECOND_LIMIT_ORDER, // 11
        SECOND_LIMIT_START, // 12
        SECOND_LIMIT_EXCHANGE, // 13
        SECOND_LIMIT_END, // 14
        SECOND_MARKET_ORDER, // 15
        SECOND_MARKET_EXCHANGE, // 16
        SECOND_MARKET_END, // 17
        ADMIN_CANCEL_ORDER, // 18
        USER_CANCEL_ORDER, // 19
        INCREASE_EPOCH, // 20
        CREATE_TSB_TOKEN, // 21
        REDEEM, // 22
        WITHDRAW_FEE, // 23
        EVACUATION, // 24
        SET_ADMIN_TS_ADDR, // 25
        ROLL_BORROW_ORDER, // 26
        ROLL_OVER_START, // 27
        ROLL_OVER_MATCH, // 28
        ROLL_OVER_END, // 29
        USER_CANCEL_ROLL_BORROW, // 30
        ADMIN_CANCEL_ROLL_BORROW, // 31
        FORCE_CANCEL_ROLL_BORROW // 32
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
        uint16 collateralTokenId;
        uint128 collateralAmt;
        uint16 debtTokenId;
        uint128 debtAmt;
        uint32 matchedTime;
        uint32 maturityTime;
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

    struct RollBorrow {
        uint32 accountId;
        uint16 collateralTokenId;
        uint128 maxCollateralAmt;
        uint32 feeRate; // base is 1e8
        uint16 borrowTokenId;
        uint128 maxBorrowAmt;
        uint32 oldMaturityTime;
        uint32 newMaturityTime;
        uint32 expiredTime;
        uint32 maxPrincipalAndInterestRate; // base is 1e8 (maxPIR)
    }

    struct RollOverEnd {
        uint32 accountId;
        uint16 collateralTokenId;
        uint128 collateralAmt;
        uint16 debtTokenId;
        uint32 oldMaturityTime;
        uint32 newMaturityTime;
        uint128 debtAmt;
        uint32 matchedTime;
        uint128 borrowAmt;
    }

    struct CancelRollBorrow {
        uint32 accountId;
        uint16 debtTokenId;
        uint16 collateralTokenId;
        uint32 maturityTime;
    }

    /* ============ Encode public data function ============ */

    function encodeRegisterPubData(Register memory register) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(OpType.REGISTER), register.accountId, register.tsAddr);
    }

    function encodeDepositPubData(Deposit memory deposit) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(OpType.DEPOSIT), deposit.accountId, deposit.tokenId, deposit.amount);
    }

    function encodeForceWithdrawPubData(ForceWithdraw memory forceWithdraw) internal pure returns (bytes memory) {
        return
            abi.encodePacked(uint8(OpType.FORCE_WITHDRAW), forceWithdraw.accountId, forceWithdraw.tokenId, uint128(0));
    }

    function encodeEvacuationPubData(Evacuation memory evacuation) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(OpType.EVACUATION), evacuation.accountId, evacuation.tokenId, evacuation.amount);
    }

    function encodeRollBorrowPubData(RollBorrow memory rollBorrow) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                uint8(OpType.ROLL_BORROW_ORDER),
                rollBorrow.accountId,
                rollBorrow.collateralTokenId,
                rollBorrow.maxCollateralAmt,
                rollBorrow.feeRate,
                rollBorrow.borrowTokenId,
                rollBorrow.maxBorrowAmt,
                rollBorrow.oldMaturityTime,
                rollBorrow.newMaturityTime,
                rollBorrow.expiredTime,
                rollBorrow.maxPrincipalAndInterestRate
            );
    }

    function encodeForceCancelRollBorrowPubData(
        CancelRollBorrow memory forceCancelRollBorrow
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                uint8(OpType.FORCE_CANCEL_ROLL_BORROW),
                forceCancelRollBorrow.accountId,
                forceCancelRollBorrow.debtTokenId,
                forceCancelRollBorrow.collateralTokenId,
                forceCancelRollBorrow.maturityTime
            );
    }

    /* ============ Check hashed public data function ============ */

    function isRegisterHashedPubDataMatched(Register memory op, bytes32 hashedPubData) internal pure returns (bool) {
        return keccak256(encodeRegisterPubData(op)) == hashedPubData;
    }

    function isDepositHashedPubDataMatched(Deposit memory op, bytes32 hashedPubData) internal pure returns (bool) {
        return keccak256(encodeDepositPubData(op)) == hashedPubData;
    }

    function isForceWithdrawHashedPubDataMatched(
        ForceWithdraw memory op,
        bytes32 hashedPubData
    ) internal pure returns (bool) {
        return keccak256(encodeForceWithdrawPubData(op)) == hashedPubData;
    }

    function isEvacuationHashedPubDataMatched(
        Evacuation memory op,
        bytes32 hashedPubData
    ) internal pure returns (bool) {
        return keccak256(encodeEvacuationPubData(op)) == hashedPubData;
    }

    function isRollBorrowHashedPubDataMatched(
        RollBorrow memory op,
        bytes32 hashedPubData
    ) internal pure returns (bool) {
        return keccak256(encodeRollBorrowPubData(op)) == hashedPubData;
    }

    function isForceCancelRollBorrowHashedPubDataMatched(
        CancelRollBorrow memory op,
        bytes32 hashedPubData
    ) internal pure returns (bool) {
        return keccak256(encodeForceCancelRollBorrowPubData(op)) == hashedPubData;
    }

    /* ============ Read public data function ============ */

    function readRegisterPubData(bytes memory data) internal pure returns (Register memory) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        Register memory register;
        (offset, register.accountId) = Bytes.readUInt32(data, offset);
        (, register.tsAddr) = Bytes.readBytes20(data, offset);
        return register;
    }

    function readDepositPubData(bytes memory data) internal pure returns (Deposit memory) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        Deposit memory deposit;
        (offset, deposit.accountId) = Bytes.readUInt32(data, offset);
        (offset, deposit.tokenId) = Bytes.readUInt16(data, offset);
        (, deposit.amount) = Bytes.readUInt128(data, offset);
        return deposit;
    }

    function readWithdrawPubData(bytes memory data) internal pure returns (Withdraw memory) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        Withdraw memory withdraw;
        (offset, withdraw.accountId) = Bytes.readUInt32(data, offset);
        (offset, withdraw.tokenId) = Bytes.readUInt16(data, offset);
        (, withdraw.amount) = Bytes.readUInt128(data, offset);
        return withdraw;
    }

    function readForceWithdrawPubData(bytes memory data) internal pure returns (ForceWithdraw memory) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        ForceWithdraw memory forceWithdraw;
        (offset, forceWithdraw.accountId) = Bytes.readUInt32(data, offset);
        (offset, forceWithdraw.tokenId) = Bytes.readUInt16(data, offset);
        (, forceWithdraw.amount) = Bytes.readUInt128(data, offset);
        return forceWithdraw;
    }

    function readAuctionEndPubData(bytes memory data) internal pure returns (AuctionEnd memory) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        AuctionEnd memory auctionEnd;
        (offset, auctionEnd.accountId) = Bytes.readUInt32(data, offset);
        (offset, auctionEnd.collateralTokenId) = Bytes.readUInt16(data, offset);
        (offset, auctionEnd.collateralAmt) = Bytes.readUInt128(data, offset);
        (offset, auctionEnd.debtTokenId) = Bytes.readUInt16(data, offset);
        (offset, auctionEnd.debtAmt) = Bytes.readUInt128(data, offset);
        (offset, auctionEnd.matchedTime) = Bytes.readUInt32(data, offset);
        (, auctionEnd.maturityTime) = Bytes.readUInt32(data, offset);
        return auctionEnd;
    }

    function readCreateTsbTokenPubData(bytes memory data) internal pure returns (CreateTsbToken memory) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        CreateTsbToken memory createTsbToken;
        (offset, createTsbToken.maturityTime) = Bytes.readUInt32(data, offset);
        (offset, createTsbToken.baseTokenId) = Bytes.readUInt16(data, offset);
        (, createTsbToken.tsbTokenId) = Bytes.readUInt16(data, offset);
        return createTsbToken;
    }

    function readWithdrawFeePubdata(bytes memory data) internal pure returns (WithdrawFee memory) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        WithdrawFee memory withdrawFee;
        (offset, withdrawFee.tokenId) = Bytes.readUInt16(data, offset);
        (, withdrawFee.amount) = Bytes.readUInt128(data, offset);
        return withdrawFee;
    }

    function readEvacuationPubdata(bytes memory data) internal pure returns (Evacuation memory) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        Evacuation memory evacuation;
        (offset, evacuation.accountId) = Bytes.readUInt32(data, offset);
        (offset, evacuation.tokenId) = Bytes.readUInt16(data, offset);
        (, evacuation.amount) = Bytes.readUInt128(data, offset);
        return evacuation;
    }

    function readRollBorrowPubdata(bytes memory data) internal pure returns (RollBorrow memory) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        RollBorrow memory rollBorrow;
        (offset, rollBorrow.accountId) = Bytes.readUInt32(data, offset);
        (offset, rollBorrow.collateralTokenId) = Bytes.readUInt16(data, offset);
        (offset, rollBorrow.maxCollateralAmt) = Bytes.readUInt128(data, offset);
        (offset, rollBorrow.feeRate) = Bytes.readUInt32(data, offset);
        (offset, rollBorrow.borrowTokenId) = Bytes.readUInt16(data, offset);
        (offset, rollBorrow.maxBorrowAmt) = Bytes.readUInt128(data, offset);
        (offset, rollBorrow.oldMaturityTime) = Bytes.readUInt32(data, offset);
        (offset, rollBorrow.newMaturityTime) = Bytes.readUInt32(data, offset);
        (offset, rollBorrow.expiredTime) = Bytes.readUInt32(data, offset);
        (, rollBorrow.maxPrincipalAndInterestRate) = Bytes.readUInt32(data, offset);
        return rollBorrow;
    }

    function readRollOverEndPubdata(bytes memory data) internal pure returns (RollOverEnd memory) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        RollOverEnd memory rollOverEnd;
        (offset, rollOverEnd.accountId) = Bytes.readUInt32(data, offset);
        (offset, rollOverEnd.collateralTokenId) = Bytes.readUInt16(data, offset);
        (offset, rollOverEnd.collateralAmt) = Bytes.readUInt128(data, offset);
        (offset, rollOverEnd.debtTokenId) = Bytes.readUInt16(data, offset);
        (offset, rollOverEnd.oldMaturityTime) = Bytes.readUInt32(data, offset);
        (offset, rollOverEnd.newMaturityTime) = Bytes.readUInt32(data, offset);
        (offset, rollOverEnd.debtAmt) = Bytes.readUInt128(data, offset);
        (offset, rollOverEnd.matchedTime) = Bytes.readUInt32(data, offset);
        (, rollOverEnd.borrowAmt) = Bytes.readUInt128(data, offset);
        return rollOverEnd;
    }

    function readCancelRollBorrowPubdata(bytes memory data) internal pure returns (CancelRollBorrow memory) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        CancelRollBorrow memory cancelRollBorrow;
        (offset, cancelRollBorrow.accountId) = Bytes.readUInt32(data, offset);
        (offset, cancelRollBorrow.debtTokenId) = Bytes.readUInt16(data, offset);
        (offset, cancelRollBorrow.collateralTokenId) = Bytes.readUInt16(data, offset);
        (, cancelRollBorrow.maturityTime) = Bytes.readUInt32(data, offset);
        return cancelRollBorrow;
    }
}
