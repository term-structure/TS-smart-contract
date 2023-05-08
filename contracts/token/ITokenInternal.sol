// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface ITokenInternal {
    /// @notice Error for get invalid token which is paused
    error TokenIsPaused(address pausedTokenAddr);
    /// @notice Error for get token which is not whitelisted
    error TokenIsNotExist(address notWhitelistedTokenAddr);
}
