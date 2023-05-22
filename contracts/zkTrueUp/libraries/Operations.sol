// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

import {Bytes} from "./Bytes.sol";

/**
  * @title Term Structure Operations Library
  * @notice This library is used to define the operation type and the operation data structure,
            used in the rollup circuit
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
        CREATE_TS_BOND_TOKEN,
        REDEEM,
        WITHDRAW_FEE,
        EVACUATION,
        SET_ADMIN_TS_ADDR
    }

    /// @notice Custom error for reading public data
    error ReadRegisterPubDataError();
    error ReadDepositPubDataError();
    error ReadForceWithdrawPubDataError();
    error ReadWithdrawPubDataError();
    error ReadAuctionEndPubDataError();
    error ReadCreateTsbTokenPubDataError();
    error ReadWithdrawFeePubDataError();
    error ReadEvacuationPubDataError();

    /// @notice Byte length definition
    uint8 internal constant OP_TYPE_BYTES = 1;
    uint8 internal constant ACCOUNT_ID_BYTES = 4;
    uint8 internal constant TS_ADDR_BYTES = 20;
    uint8 internal constant TOKEN_ID_BYTES = 2;
    uint8 internal constant STATE_AMOUNT_BYTES = 16;
    uint8 internal constant TIME_BYTES = 4;

    uint256 internal constant REGISTER_PUBDATA_BYTES = OP_TYPE_BYTES + ACCOUNT_ID_BYTES + TS_ADDR_BYTES;
    uint256 internal constant DEPOSIT_PUBDATA_BYTES =
        OP_TYPE_BYTES + ACCOUNT_ID_BYTES + TOKEN_ID_BYTES + STATE_AMOUNT_BYTES;
    uint256 internal constant FORCE_WITHDRAW_PUBDATA_BYTES =
        OP_TYPE_BYTES + ACCOUNT_ID_BYTES + TOKEN_ID_BYTES + STATE_AMOUNT_BYTES;
    uint256 internal constant WITHDRAW_PUBDATA_BYTES =
        OP_TYPE_BYTES + ACCOUNT_ID_BYTES + TOKEN_ID_BYTES + STATE_AMOUNT_BYTES;
    uint256 internal constant AUCTION_END_PUBDATA_BYTES =
        OP_TYPE_BYTES + ACCOUNT_ID_BYTES + TOKEN_ID_BYTES + TOKEN_ID_BYTES + STATE_AMOUNT_BYTES + STATE_AMOUNT_BYTES;
    uint256 internal constant CREATE_TS_BOND_TOKEN_PUBDATA_BYTES =
        OP_TYPE_BYTES + TIME_BYTES + TOKEN_ID_BYTES + TOKEN_ID_BYTES;
    uint256 internal constant WITHDRAW_FEE_PUBDATA_BYTES = OP_TYPE_BYTES + TOKEN_ID_BYTES + STATE_AMOUNT_BYTES;
    uint256 internal constant EVACUATION_PUBDATA_BYTES =
        OP_TYPE_BYTES + ACCOUNT_ID_BYTES + TOKEN_ID_BYTES + STATE_AMOUNT_BYTES;

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

    /// @notice Return the bytes of register object
    /// @param register The register object
    /// @return buf The bytes of register object
    function encodeRegisterPubData(Register memory register) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(OpType.REGISTER), register.accountId, register.tsAddr);
    }

    /// @notice Return the bytes of deposit object
    /// @param deposit The deposit object
    /// @return buf The bytes of deposit object
    function encodeDepositPubData(Deposit memory deposit) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(OpType.DEPOSIT), deposit.accountId, deposit.tokenId, deposit.amount);
    }

    /// @notice Return the bytes of force withdraw object
    /// @param forceWithdraw The force withdraw object
    /// @return buf The bytes of force withdraw object
    function encodeForceWithdrawPubData(ForceWithdraw memory forceWithdraw) internal pure returns (bytes memory) {
        return
            abi.encodePacked(uint8(OpType.FORCE_WITHDRAW), forceWithdraw.accountId, forceWithdraw.tokenId, uint128(0));
    }

    /// @notice Return the bytes of evacuation object
    /// @param evacuation The force evacuation object
    /// @return buf The bytes of force evacuation object
    function encodeEvacuationPubData(Evacuation memory evacuation) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(OpType.EVACUATION), evacuation.accountId, evacuation.tokenId, evacuation.amount);
    }

    /// @notice Check whether the register request hashed public data is matched
    /// @param op The register request
    /// @param hashedPubData The hashedPubData of register request
    /// @return isExisted Return true if exists, else return false
    function isRegisterHashedPubDataMatched(Register memory op, bytes32 hashedPubData) internal pure returns (bool) {
        return keccak256(encodeRegisterPubData(op)) == hashedPubData;
    }

    /// @notice Check whether the deposit request hashed public data is matched
    /// @param op The deposit request
    /// @param hashedPubData The hashedPubData of deposit request
    /// @return isExisted Return true if exists, else return false
    function isDepositHashedPubDataMatched(Deposit memory op, bytes32 hashedPubData) internal pure returns (bool) {
        return keccak256(encodeDepositPubData(op)) == hashedPubData;
    }

    /// @notice Check whether the force withdraw request hashed public data is matched
    /// @param op The force withdraw request
    /// @param hashedPubData The hashedPubData of force withdraw request
    /// @return isExisted Return true if exists, else return false
    function isForceWithdrawHashedPubDataMatched(
        ForceWithdraw memory op,
        bytes32 hashedPubData
    ) internal pure returns (bool) {
        return keccak256(encodeForceWithdrawPubData(op)) == hashedPubData;
    }

    /// @notice Check whether the evacuation request hashed public data is matched
    /// @param op The evacuation request
    /// @param hashedPubData The hashedPubData of evacuation request
    /// @return isExisted Return true if exists, else return false
    function isEvacuationHashedPubDataMatched(
        Evacuation memory op,
        bytes32 hashedPubData
    ) internal pure returns (bool) {
        return keccak256(encodeEvacuationPubData(op)) == hashedPubData;
    }

    /**
        @notice Read public data function
        @dev Read public data from bytes
     */

    function readRegisterPubData(bytes memory data) internal pure returns (Register memory) {
        uint256 offset = OP_TYPE_BYTES;
        Register memory register;
        (offset, register.accountId) = Bytes.readUInt32(data, offset);
        (offset, register.tsAddr) = Bytes.readBytes20(data, offset);
        if (offset != REGISTER_PUBDATA_BYTES) revert ReadRegisterPubDataError();
        return register;
    }

    function readDepositPubData(bytes memory data) internal pure returns (Deposit memory) {
        uint256 offset = OP_TYPE_BYTES;
        Deposit memory deposit;
        (offset, deposit.accountId) = Bytes.readUInt32(data, offset);
        (offset, deposit.tokenId) = Bytes.readUInt16(data, offset);
        (offset, deposit.amount) = Bytes.readUInt128(data, offset);
        if (offset != DEPOSIT_PUBDATA_BYTES) revert ReadDepositPubDataError();
        return deposit;
    }

    function readWithdrawPubData(bytes memory data) internal pure returns (Withdraw memory) {
        uint256 offset = OP_TYPE_BYTES;
        Withdraw memory withdraw;
        (offset, withdraw.accountId) = Bytes.readUInt32(data, offset);
        (offset, withdraw.tokenId) = Bytes.readUInt16(data, offset);
        (offset, withdraw.amount) = Bytes.readUInt128(data, offset);
        if (offset != WITHDRAW_PUBDATA_BYTES) revert ReadWithdrawPubDataError();
        return withdraw;
    }

    function readForceWithdrawPubData(bytes memory data) internal pure returns (ForceWithdraw memory) {
        uint256 offset = OP_TYPE_BYTES;
        ForceWithdraw memory forceWithdraw;
        (offset, forceWithdraw.accountId) = Bytes.readUInt32(data, offset);
        (offset, forceWithdraw.tokenId) = Bytes.readUInt16(data, offset);
        (offset, forceWithdraw.amount) = Bytes.readUInt128(data, offset);
        if (offset != FORCE_WITHDRAW_PUBDATA_BYTES) revert ReadForceWithdrawPubDataError();
        return forceWithdraw;
    }

    function readAuctionEndPubData(bytes memory data) internal pure returns (AuctionEnd memory) {
        uint256 offset = OP_TYPE_BYTES;
        AuctionEnd memory auctionEnd;
        (offset, auctionEnd.accountId) = Bytes.readUInt32(data, offset);
        (offset, auctionEnd.collateralTokenId) = Bytes.readUInt16(data, offset);
        (offset, auctionEnd.collateralAmt) = Bytes.readUInt128(data, offset);
        (offset, auctionEnd.tsbTokenId) = Bytes.readUInt16(data, offset);
        (offset, auctionEnd.debtAmt) = Bytes.readUInt128(data, offset);
        if (offset != AUCTION_END_PUBDATA_BYTES) revert ReadAuctionEndPubDataError();
        return auctionEnd;
    }

    function readCreateTsbTokenPubData(bytes memory data) internal pure returns (CreateTsbToken memory) {
        uint256 offset = OP_TYPE_BYTES;
        CreateTsbToken memory createTsbToken;
        (offset, createTsbToken.maturityTime) = Bytes.readUInt32(data, offset);
        (offset, createTsbToken.baseTokenId) = Bytes.readUInt16(data, offset);
        (offset, createTsbToken.tsbTokenId) = Bytes.readUInt16(data, offset);
        if (offset != CREATE_TS_BOND_TOKEN_PUBDATA_BYTES) revert ReadCreateTsbTokenPubDataError();
        return createTsbToken;
    }

    function readWithdrawFeePubdata(bytes memory data) internal pure returns (WithdrawFee memory) {
        uint256 offset = OP_TYPE_BYTES;
        WithdrawFee memory withdrawFee;
        (offset, withdrawFee.tokenId) = Bytes.readUInt16(data, offset);
        (offset, withdrawFee.amount) = Bytes.readUInt128(data, offset);
        if (offset != WITHDRAW_FEE_PUBDATA_BYTES) revert ReadWithdrawFeePubDataError();
        return withdrawFee;
    }

    function readEvacuationPubdata(bytes memory data) internal pure returns (Evacuation memory) {
        uint256 offset = OP_TYPE_BYTES;
        Evacuation memory evacuation;
        (offset, evacuation.accountId) = Bytes.readUInt32(data, offset);
        (offset, evacuation.tokenId) = Bytes.readUInt16(data, offset);
        (offset, evacuation.amount) = Bytes.readUInt128(data, offset);
        if (offset != EVACUATION_PUBDATA_BYTES) revert ReadEvacuationPubDataError();
        return evacuation;
    }
}
