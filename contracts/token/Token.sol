// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {TokenStorage} from "./TokenStorage.sol";
import {TokenInternal} from "./TokenInternal.sol";
import {IToken} from "./IToken.sol";
import {Config} from "../libraries/Config.sol";

contract Token is AccessControlInternal, TokenInternal, IToken {
    using TokenStorage for TokenStorage.Layout;

    /// @notice Set paused state of the token
    /// @param tokenAddr The token address
    /// @param isPaused The boolean value of paused state
    function setPaused(address tokenAddr, bool isPaused) external onlyRole(Config.ADMIN_ROLE) {
        _getValidTokenId(tokenAddr);
        TokenStorage.layout().setPaused(tokenAddr, isPaused);
        emit SetPaused(tokenAddr, isPaused);
    }

    /// @notice Return the token number
    /// @return tokenNum The token number
    function getTokenNum() external view returns (uint16) {
        return TokenStorage.layout().getTokenNum();
    }

    /// @notice Return the token id
    /// @param tokenAddr The token address
    /// @return tokenId The token id
    function getTokenId(address tokenAddr) external view returns (uint16) {
        return TokenStorage.layout().getTokenId(tokenAddr);
    }
}
