// SPDX-License-Identifier: MIT
// solhint-disable no-inline-assembly
pragma solidity ^0.8.17;

import {Config} from "./Config.sol";

/**
 * @title Bytes Library
 * @author Term Structure Labs
 * @notice Library for bytes operations
 * @dev Original source code refer from https://github.com/GNSPS/solidity-bytes-utils/blob/master/contracts/BytesLib.sol#L228
 */
library Bytes {
    /// @notice Error for invalid slice length
    error OverPublicDataLength(uint256 pubDataLength, uint256 start, uint256 expectedDataLength);
    /// @notice Error for invalid bytes length
    error InvalidBytesLength(uint256 bytesLen, uint256 offset);

    /// @notice slice public data to get the length of the one chunk (12 bytes)
    /// @param pubData The public data of the rollup
    /// @param start The start index of the one chunk length
    /// @return data The data of the one chunk length
    function sliceOneChunkBytes(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.BYTES_OF_CHUNK; // 12 bytes
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

    /// @notice slice public data to get the length of the two chunks (24 bytes)
    /// @param pubData The public data of the rollup
    /// @param start The start index of the two chunks length
    /// @return data The data of the two chunks length
    function sliceTwoChunksBytes(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.BYTES_OF_TWO_CHUNKS; // 24 bytes
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

    /// @notice slice public data to get the length of the three chunks (36 bytes)
    /// @param pubData The public data of the rollup
    /// @param start The start index of the three chunks length
    /// @return data The data of the three chunks length
    function sliceThreeChunksBytes(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.BYTES_OF_THREE_CHUNKS; // 36 bytes
        _validSliceLength(pubData.length, start, bytesLength);
        bytes memory data = new bytes(bytesLength);
        assembly {
            let slice_curr := add(data, 0x20)
            let array_curr := add(pubData, add(start, 0x20))
            // mstore 2 times for 36 bytes
            mstore(slice_curr, mload(array_curr))
            mstore(add(slice_curr, 0x20), mload(add(array_curr, 0x20)))
        }
        return data;
    }

    /// @notice slice public data to get the length of the four chunks (48 bytes)
    /// @param pubData The public data of the rollup
    /// @param start The start index of the four chunks length
    /// @return data The data of the four chunks length
    function sliceFourChunksBytes(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.BYTES_OF_FOUR_CHUNKS; // 48 bytes
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

    /// @notice slice public data to get the length of the five chunks (60 bytes)
    /// @param pubData The public data of the rollup
    /// @param start The start index of the five chunks length
    /// @return data The data of the five chunks length
    function sliceFiveChunksBytes(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.BYTES_OF_FIVE_CHUNKS; // 60 bytes
        _validSliceLength(pubData.length, start, bytesLength);
        bytes memory data = new bytes(bytesLength);
        assembly {
            let slice_curr := add(data, 0x20)
            let array_curr := add(pubData, add(start, 0x20))
            // mstore 2 times for 60 bytes
            mstore(slice_curr, mload(array_curr))
            mstore(add(slice_curr, 0x20), mload(add(array_curr, 0x20)))
        }
        return data;
    }

    /// @notice slice public data to get the length of the six chunks (72 bytes)
    /// @param pubData The public data of the rollup
    /// @param start The start index of the six chunks length
    /// @return data The data of the six chunks length
    function sliceSixChunksBytes(bytes memory pubData, uint256 start) internal pure returns (bytes memory) {
        uint256 bytesLength = Config.BYTES_OF_SIX_CHUNKS; // 72 bytes
        _validSliceLength(pubData.length, start, bytesLength);
        bytes memory data = new bytes(bytesLength);
        assembly {
            let slice_curr := add(data, 0x20)
            let array_curr := add(pubData, add(start, 0x20))
            // mstore 3 times for 72 bytes
            mstore(slice_curr, mload(array_curr))
            mstore(add(slice_curr, 0x20), mload(add(array_curr, 0x20)))
            mstore(add(slice_curr, 0x40), mload(add(array_curr, 0x40)))
        }
        return data;
    }

    /// @notice Internal function to check the slice length
    /// @param pubDataLength The length of the public data
    /// @param start The start index of the slice
    /// @param sliceLength The length of the slice
    function _validSliceLength(uint256 pubDataLength, uint256 start, uint256 sliceLength) private pure {
        if (pubDataLength < (start + sliceLength)) revert OverPublicDataLength(pubDataLength, start, sliceLength);
    }

    function readUInt32(bytes memory _data, uint256 _offset) internal pure returns (uint256 newOffset, uint32 r) {
        newOffset = _offset + 4;
        r = bytesToUInt32(_data, _offset);
    }

    function bytesToUInt32(bytes memory _bytes, uint256 _start) internal pure returns (uint32 r) {
        uint256 offset = _start + 0x4;
        if (_bytes.length < offset) revert InvalidBytesLength(_bytes.length, offset);
        assembly {
            r := mload(add(_bytes, offset))
        }
    }

    function readBytes12(bytes memory _data, uint256 _offset) internal pure returns (uint256 newOffset, bytes12 r) {
        newOffset = _offset + 12;
        r = bytesToBytes12(_data, _offset);
    }

    function bytesToBytes12(bytes memory self, uint256 _start) internal pure returns (bytes12 r) {
        uint256 offset = _start + 12;
        if (self.length < offset) revert InvalidBytesLength(self.length, offset);
        assembly {
            r := mload(add(add(self, 0x20), _start))
        }
    }

    function readBytes20(bytes memory _data, uint256 _offset) internal pure returns (uint256 newOffset, bytes20 r) {
        newOffset = _offset + 20;
        r = bytesToBytes20(_data, _offset);
    }

    function bytesToBytes20(bytes memory self, uint256 _start) internal pure returns (bytes20 r) {
        uint256 offset = _start + 20;
        if (self.length < offset) revert InvalidBytesLength(self.length, offset);
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
        if (_bytes.length < offset) revert InvalidBytesLength(_bytes.length, offset);
        assembly {
            r := mload(add(_bytes, offset))
        }
    }

    function bytesToUInt128(bytes memory _bytes, uint256 _start) internal pure returns (uint128 r) {
        uint256 offset = _start + 0x10;
        if (_bytes.length < offset) revert InvalidBytesLength(_bytes.length, offset);
        assembly {
            r := mload(add(_bytes, offset))
        }
    }

    function readUInt128(bytes memory _data, uint256 _offset) internal pure returns (uint256 newOffset, uint128 r) {
        newOffset = _offset + 16;
        r = bytesToUInt128(_data, _offset);
    }
}
