// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {TsbStorage} from "../zkTrueUp/tsb/TsbStorage.sol";
import {TokenStorage} from "../zkTrueUp/token/TokenStorage.sol";
import {TsbFacet} from "../zkTrueUp/tsb/TsbFacet.sol";
import {TokenLib} from "../zkTrueUp/token/TokenLib.sol";
import {TsbLib} from "../zkTrueUp/tsb/TsbLib.sol";
import {TsbToken} from "../zkTrueUp/tsb/TsbToken.sol";
import {Config} from "../zkTrueUp/libraries/Config.sol";

contract TsbMock is TsbFacet {
    using TokenLib for TokenStorage.Layout;
    using TsbLib for TsbStorage.Layout;

    //! Mock contract for testing
    function createTsbToken(
        uint16 underlyingTokenId,
        uint32 maturityTime,
        string memory name,
        string memory symbol
    ) external override onlyRole(Config.OPERATOR_ROLE) returns (address) {
        // if (maturityTime <= block.timestamp) revert InvalidMaturityTime(maturityTime); //! ignore for test
        address underlyingAssetAddr = TokenLib.getTokenStorage().getAssetConfig(underlyingTokenId).tokenAddr;
        if (underlyingAssetAddr == address(0)) revert UnderlyingAssetIsNotExist(underlyingTokenId);

        TsbStorage.Layout storage tsbsl = TsbLib.getTsbStorage();
        uint48 tsbTokenKey = TsbLib.getTsbTokenKey(underlyingTokenId, maturityTime);
        address tokenAddr = tsbsl.getTsbTokenAddr(tsbTokenKey);
        if (tokenAddr != address(0)) revert TsbTokenIsExist(tokenAddr);
        address tsbTokenAddr = address(new TsbToken(name, symbol, underlyingAssetAddr, maturityTime));
        tsbsl.tsbTokens[tsbTokenKey] = tsbTokenAddr;
        emit TsbTokenCreated(tsbTokenAddr, underlyingTokenId, maturityTime);
        return tsbTokenAddr;
    }
}
