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
        ROLL_BORROW_ORDER,
        ROLL_OVER_START,
        ROLL_OVER_MATCH,
        ROLL_OVER_END,
        USER_CANCEL_ROLL_BORROW,
        ADMIN_CANCEL_ROLL_BORROW,
        FORCE_CANCEL_ROLL_BORROW
        //TODO: check latest op type
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

    struct RollBorrow {
        uint32 accountId;
        uint16 collateralTokenId;
        uint16 borrowTokenId;
        uint32 maturityTime;
        uint32 expiredTime;
        uint32 feeRate; // base is 1e8
        uint32 annualPercentageRate; // base is 1e8 (APR)
        uint128 maxCollateralAmt;
        uint128 maxBorrowAmt;
    }

    struct RollOverEnd {
        uint32 accountId;
        uint32 matchedTime;
        uint16 collateralTokenId;
        uint16 debtTokenId;
        uint32 oldMaturityTime;
        uint32 newMaturityTime;
        uint128 collateralAmt;
        uint128 borrowAmt;
        uint128 debtAmt;
    }

    struct CancelRollBorrow {
        uint32 accountId;
        uint32 maturityTime;
        uint16 collateralTokenId;
        uint16 debtTokenId;
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
                rollBorrow.borrowTokenId,
                rollBorrow.maturityTime,
                rollBorrow.expiredTime,
                rollBorrow.feeRate,
                rollBorrow.annualPercentageRate,
                rollBorrow.maxCollateralAmt,
                rollBorrow.maxBorrowAmt
            );
    }

    function encodeForceCancelRollBorrowPubData(
        CancelRollBorrow memory forceCancelRollBorrow
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                uint8(OpType.FORCE_CANCEL_ROLL_BORROW),
                forceCancelRollBorrow.accountId,
                forceCancelRollBorrow.maturityTime,
                forceCancelRollBorrow.collateralTokenId,
                forceCancelRollBorrow.debtTokenId
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
        (offset, auctionEnd.tsbTokenId) = Bytes.readUInt16(data, offset);
        (, auctionEnd.debtAmt) = Bytes.readUInt128(data, offset);
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
        (offset, rollBorrow.borrowTokenId) = Bytes.readUInt16(data, offset);
        (offset, rollBorrow.maturityTime) = Bytes.readUInt32(data, offset);
        (offset, rollBorrow.expiredTime) = Bytes.readUInt32(data, offset);
        (offset, rollBorrow.feeRate) = Bytes.readUInt32(data, offset);
        (offset, rollBorrow.annualPercentageRate) = Bytes.readUInt32(data, offset);
        (offset, rollBorrow.maxCollateralAmt) = Bytes.readUInt128(data, offset);
        (, rollBorrow.maxBorrowAmt) = Bytes.readUInt128(data, offset);
        return rollBorrow;
    }

    function readRollOverEndPubdata(bytes memory data) internal pure returns (RollOverEnd memory) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        RollOverEnd memory rollOverEnd;
        (offset, rollOverEnd.accountId) = Bytes.readUInt32(data, offset);
        (offset, rollOverEnd.matchedTime) = Bytes.readUInt32(data, offset);
        (offset, rollOverEnd.collateralTokenId) = Bytes.readUInt16(data, offset);
        (offset, rollOverEnd.debtTokenId) = Bytes.readUInt16(data, offset);
        (offset, rollOverEnd.oldMaturityTime) = Bytes.readUInt32(data, offset);
        (offset, rollOverEnd.newMaturityTime) = Bytes.readUInt32(data, offset);
        (offset, rollOverEnd.collateralAmt) = Bytes.readUInt128(data, offset);
        (offset, rollOverEnd.borrowAmt) = Bytes.readUInt128(data, offset);
        (, rollOverEnd.debtAmt) = Bytes.readUInt128(data, offset);
        return rollOverEnd;
    }

    function readCancelRollBorrowPubdata(bytes memory data) internal pure returns (CancelRollBorrow memory) {
        uint256 offset = Config.BYTES_OF_OP_TYPE;
        CancelRollBorrow memory cancelRollBorrow;
        (offset, cancelRollBorrow.accountId) = Bytes.readUInt32(data, offset);
        (offset, cancelRollBorrow.maturityTime) = Bytes.readUInt32(data, offset);
        (offset, cancelRollBorrow.collateralTokenId) = Bytes.readUInt16(data, offset);
        (, cancelRollBorrow.debtTokenId) = Bytes.readUInt16(data, offset);
        return cancelRollBorrow;
    }
}
