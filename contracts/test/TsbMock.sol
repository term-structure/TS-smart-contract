// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {TsbFacet} from "../tsb/TsbFacet.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {TsbLib} from "../tsb/TsbLib.sol";
import {TsbStorage} from "../tsb/TsbStorage.sol";
import {TsbToken} from "../TsbToken.sol";
import {Config} from "../libraries/Config.sol";

contract TsbMock is TsbFacet {
    //! Mock contract for testing
    function createTsbToken(
        uint16 underlyingTokenId,
        uint32 maturityTime,
        string memory name,
        string memory symbol
    ) external override onlyRole(Config.OPERATOR_ROLE) returns (address) {
        // if (maturityTime <= block.timestamp) revert InvalidMaturityTime(maturityTime); //! ignore for test
        address underlyingAssetAddr = TokenLib.getAssetConfig(underlyingTokenId).tokenAddr;
        if (underlyingAssetAddr == address(0)) revert UnderlyingAssetIsNotExist(underlyingTokenId);
        uint48 tsbTokenKey = TsbLib.getTsbTokenKey(underlyingTokenId, maturityTime);
        address tokenAddr = TsbLib.getTsbTokenAddr(tsbTokenKey);
        if (tokenAddr != address(0)) revert TsbTokenIsExist(tokenAddr);
        address tsbTokenAddr = address(new TsbToken(name, symbol, underlyingAssetAddr, maturityTime));
        TsbStorage.layout().tsbTokens[tsbTokenKey] = tsbTokenAddr;
        emit TsbTokenCreated(tsbTokenAddr, underlyingTokenId, maturityTime);
        return tsbTokenAddr;
    }
}
