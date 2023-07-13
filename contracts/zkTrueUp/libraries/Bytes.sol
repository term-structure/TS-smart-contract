// SPDX-License-Identifier: MIT
// solhint-disable no-inline-assembly
pragma solidity ^0.8.17;

import {Config} from "./Config.sol";

/**
 * @title Term Structure Bytes Library
 */
library Bytes {
    /// @notice Error for invalid slice length
    error OverPublicDataLength(uint256 pubDataLength, uint256 start, uint256 expectedDataLength);

    /// @notice slice public data to get register data
    /// @param pubData The public data of the rollup
    /// @param start The start index of the register data
    /// @return data The register data
    function sliceRegisterData(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.REGISTER_BYTES; // 48 bytes
        _validSliceLength(pubData.length, start, bytesLength);
        bytes memory data = new bytes(bytesLength);
        assembly {
            let slice_curr := add(data, 0x20)
            let array_curr := add(pubData, add(start, 0x20))
            // mstore 2 times for 48 bytes
            mstore(slice_curr, mload(array_curr))
            mstore(add(slice_curr, 0x20), mload(add(array_curr, 0x20)))
        }
        return data;
    }

    /// @notice slice public data to get deposit data
    /// @param pubData The public data of the rollup
    /// @param start The start index of the deposit data
    /// @return data The deposit data
    function sliceDepositData(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.DEPOSIT_BYTES; // 24 bytes
        _validSliceLength(pubData.length, start, bytesLength);
        bytes memory data = new bytes(bytesLength);
        assembly {
            let slice_curr := add(data, 0x20)
            let array_curr := add(pubData, add(start, 0x20))
            // mstore 1 times for 24 bytes
            mstore(slice_curr, mload(array_curr))
        }
        return data;
    }

    /// @notice slice public data to get withdraw data
    /// @param pubData The public data of the rollup
    /// @param start The start index of the withdraw data
    /// @return data The withdraw data
    function sliceWithdrawData(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.WITHDRAW_BYTES; // 24 bytes
        _validSliceLength(pubData.length, start, bytesLength);
        bytes memory data = new bytes(bytesLength);
        assembly {
            let slice_curr := add(data, 0x20)
            let array_curr := add(pubData, add(start, 0x20))
            // mstore 1 times for 24 bytes
            mstore(slice_curr, mload(array_curr))
        }
        return data;
    }

    /// @notice slice public data to get force withdraw data
    /// @param pubData The public data of the rollup
    /// @param start The start index of the force withdraw data
    /// @return data The force withdraw data
    function sliceForceWithdrawData(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.FORCE_WITHDRAW_BYTES; // 24 bytes
        _validSliceLength(pubData.length, start, bytesLength);
        bytes memory data = new bytes(bytesLength);
        assembly {
            let slice_curr := add(data, 0x20)
            let array_curr := add(pubData, add(start, 0x20))
            // mstore 1 times for 24 bytes
            mstore(slice_curr, mload(array_curr))
        }
        return data;
    }

    /// @notice slice public data to get auction end data
    /// @param pubData The public data of the rollup
    /// @param start The start index of the auction end data
    /// @return data The auction end data
    function sliceAuctionEndData(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.AUCTION_END_BYTES; // 48 bytes
        _validSliceLength(pubData.length, start, bytesLength);
        bytes memory data = new bytes(bytesLength);
        assembly {
            let slice_curr := add(data, 0x20)
            let array_curr := add(pubData, add(start, 0x20))
            // mstore 2 times for 48 bytes
            mstore(slice_curr, mload(array_curr))
            mstore(add(slice_curr, 0x20), mload(add(array_curr, 0x20)))
        }
        return data;
    }

    /// @notice slice public data to get create tsb token data
    /// @param pubData The public data of the rollup
    /// @param start The start index of the create tsb token data
    /// @return data The create tsb token data
    function sliceCreateTsbTokenData(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.CREATE_TSB_TOKEN_BYTES; // 12 bytes
        _validSliceLength(pubData.length, start, bytesLength);
        bytes memory data = new bytes(bytesLength);
        assembly {
            let slice_curr := add(data, 0x20)
            let array_curr := add(pubData, add(start, 0x20))
            // mstore 1 times for 12 bytes
            mstore(slice_curr, mload(array_curr))
        }
        return data;
    }

    /// @notice slice public data to get withdraw fee data
    /// @param pubData The public data of the rollup
    /// @param start The start index of the withdraw fee data
    /// @return data The withdraw fee data
    function sliceWithdrawFeeData(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.WITHDRAW_FEE_BYTES; // 24 bytes
        _validSliceLength(pubData.length, start, bytesLength);
        bytes memory data = new bytes(bytesLength);
        assembly {
            let slice_curr := add(data, 0x20)
            let array_curr := add(pubData, add(start, 0x20))
            // mstore 1 times for 24 bytes
            mstore(slice_curr, mload(array_curr))
        }
        return data;
    }

    /// @notice slice public data to get evacuation data
    /// @param pubData The public data of the rollup
    /// @param start The start index of the evacuation data
    /// @return data The evacuation data
    function sliceEvacuationData(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.EVACUATION_BYTES; // 24 bytes
        _validSliceLength(pubData.length, start, bytesLength);
        bytes memory data = new bytes(bytesLength);
        assembly {
            let slice_curr := add(data, 0x20)
            let array_curr := add(pubData, add(start, 0x20))
            // mstore 1 times for 24 bytes
            mstore(slice_curr, mload(array_curr))
        }
        return data;
    }

    function readUInt32(bytes memory _data, uint256 _offset) internal pure returns (uint256 newOffset, uint32 r) {
        newOffset = _offset + 4;
        r = bytesToUInt32(_data, _offset);
    }

    function bytesToUInt32(bytes memory _bytes, uint256 _start) internal pure returns (uint32 r) {
        uint256 offset = _start + 0x4;
        require(_bytes.length >= offset, "V");
        assembly {
            r := mload(add(_bytes, offset))
        }
    }

    function readBytes20(bytes memory _data, uint256 _offset) internal pure returns (uint256 newOffset, bytes20 r) {
        newOffset = _offset + 20;
        r = bytesToBytes20(_data, _offset);
    }

    function bytesToBytes20(bytes memory self, uint256 _start) internal pure returns (bytes20 r) {
        require(self.length >= (_start + 20), "S");
        assembly {
            r := mload(add(add(self, 0x20), _start))
        }
    }

    function readUInt16(bytes memory _data, uint256 _offset) internal pure returns (uint256 newOffset, uint16 r) {
        newOffset = _offset + 2;
        r = bytesToUInt16(_data, _offset);
    }

    function bytesToUInt16(bytes memory _bytes, uint256 _start) internal pure returns (uint16 r) {
        uint256 offset = _start + 0x2;
        require(_bytes.length >= offset, "T");
        assembly {
            r := mload(add(_bytes, offset))
        }
    }

    function bytesToUInt128(bytes memory _bytes, uint256 _start) internal pure returns (uint128 r) {
        uint256 offset = _start + 0x10;
        require(_bytes.length >= offset, "W");
        assembly {
            r := mload(add(_bytes, offset))
        }
    }

    function readUInt128(bytes memory _data, uint256 _offset) internal pure returns (uint256 newOffset, uint128 r) {
        newOffset = _offset + 16;
        r = bytesToUInt128(_data, _offset);
    }

    function _validSliceLength(uint256 pubDataLength, uint256 start, uint256 sliceLength) private pure {
        if (pubDataLength < (start + sliceLength)) revert OverPublicDataLength(pubDataLength, start, sliceLength);
    }
}
