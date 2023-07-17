// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IWETH} from "../interfaces/IWETH.sol";
import {IPoseidonUnit2} from "../interfaces/IPoseidonUnit2.sol";
import {IVerifier} from "../interfaces/IVerifier.sol";
import {IPool} from "../interfaces/aaveV3/IPool.sol";

/**
 * @title Term Structure Address Storage
 * @author Term Structure Labs
 */
library AddressStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTrueUp.contracts.storage.Address")) - 1);

    struct Layout {
        /// @notice WETH contract
        IWETH wETH;
        /// @notice PoseidonUnit2 contract
        IPoseidonUnit2 poseidonUnit2;
        /// @notice Verifier contract
        IVerifier verifier;
        /// @notice Evacuation verifier contract
        IVerifier evacuVerifier;
        /// @notice Aave V3 pool contract
        IPool aaveV3Pool;
    }

    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            s.slot := slot
        }
    }
}
