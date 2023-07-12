// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TsbStorage} from "../zkTrueUp/tsb/TsbStorage.sol";
import {TokenStorage} from "../zkTrueUp/token/TokenStorage.sol";
import {TsbFacet} from "../zkTrueUp/tsb/TsbFacet.sol";
import {TokenLib} from "../zkTrueUp/token/TokenLib.sol";
import {TsbLib} from "../zkTrueUp/tsb/TsbLib.sol";
import {TsbToken} from "../zkTrueUp/tsb/TsbToken.sol";
import {ITsbToken} from "../zkTrueUp/interfaces/ITsbToken.sol";
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
    ) external override onlyRole(Config.OPERATOR_ROLE) {
        // if (maturityTime <= block.timestamp) revert InvalidMaturityTime(maturityTime);
        IERC20 underlyingAsset = TokenStorage.layout().getAssetConfig(underlyingTokenId).token;
        if (address(underlyingAsset) == address(0)) revert UnderlyingAssetIsNotExist(underlyingTokenId);

        TsbStorage.Layout storage tsbsl = TsbStorage.layout();
        uint48 tsbTokenKey = TsbLib.getTsbTokenKey(underlyingTokenId, maturityTime);
        ITsbToken tsbToken = tsbsl.getTsbToken(tsbTokenKey);
        if (address(tsbToken) != address(0)) revert TsbTokenIsExist(tsbToken);

        try new TsbToken(name, symbol, underlyingAsset, maturityTime) returns (TsbToken newTsbToken) {
            tsbToken = ITsbToken(address(newTsbToken));
            tsbsl.tsbTokens[tsbTokenKey] = tsbToken;
            emit TsbTokenCreated(tsbToken, underlyingAsset, maturityTime);
        } catch {
            revert TsbTokenCreateFailed(name, symbol, underlyingAsset, maturityTime);
        }
    }
}
