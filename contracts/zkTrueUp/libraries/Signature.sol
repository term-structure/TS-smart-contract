// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title Signature related library
 * @author Term Structure Labs
 * @notice The mutated EIP712 library for diamond proxy standard
 *         Part of source code is referenced from
 *         https://github.com/solidstate-network/solidstate-solidity/blob/master/contracts/cryptography/EIP712.sol &
 *         https://github.com/OpenZeppelin/openzeppelin-contracts/tree/master/contracts/utils/cryptography
 */
library Signature {
    error InvalidSignature(address signer, address expectedSigner);

    error SignatureExpired(uint256 deadline, uint256 currentTime);

    bytes32 internal constant EIP712_TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 internal constant EIP712_NAME_HASH = keccak256("ZkTrueUp");

    bytes32 internal constant EIP712_VERSION_HASH = keccak256("1");

    function verifyDeadline(uint256 deadline) internal view {
        if (deadline < block.timestamp) revert SignatureExpired(deadline, block.timestamp);
    }

    function verifySignature(address expectedSigner, bytes32 structHash, uint8 v, bytes32 r, bytes32 s) internal view {
        bytes32 digest = hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer != expectedSigner) revert InvalidSignature(signer, expectedSigner);
    }

    function hashTypedDataV4(bytes32 structHash) internal view returns (bytes32) {
        return toTypedDataHash(calcDomainSeparator(), structHash);
    }

    function toTypedDataHash(bytes32 domainSeparator, bytes32 structHash) internal pure returns (bytes32 digest) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, hex"19_01")
            mstore(add(ptr, 0x02), domainSeparator)
            mstore(add(ptr, 0x22), structHash)
            digest := keccak256(ptr, 0x42)
        }
    }

    function calcDomainSeparator() internal view returns (bytes32 domainSeparator) {
        bytes32 typeHash = EIP712_TYPE_HASH;
        bytes32 nameHash = EIP712_NAME_HASH;
        bytes32 versionHash = EIP712_VERSION_HASH;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            // load free memory pointer
            let pointer := mload(0x40)

            mstore(pointer, typeHash)
            mstore(add(pointer, 32), nameHash)
            mstore(add(pointer, 64), versionHash)
            mstore(add(pointer, 96), chainid())
            mstore(add(pointer, 128), address())

            domainSeparator := keccak256(pointer, 160)

            // equivalent solidity code:
            // keccak256(
            //   abi.encode(
            //     typeHash,
            //     nameHash,
            //     versionHash,
            //     block.chainid,
            //     address(this)
            //   )
            // );
        }
    }
}
