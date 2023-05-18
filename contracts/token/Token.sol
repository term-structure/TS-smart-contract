// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {TokenStorage} from "./TokenStorage.sol";
import {IToken} from "./IToken.sol";

contract Token is IToken {
    using TokenStorage for TokenStorage.Layout;

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
